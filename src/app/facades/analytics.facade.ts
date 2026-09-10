import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { type AppError, notReady } from '../core/errors/app-error';
import type { Category } from '../core/types/category';
import { type Event, type EventType, isOutflow } from '../core/types/event';
import { type DateRange, type IsoDate, addMonthsClamped, endOfMonth, minIso, startOfMonth, todayIso } from '../core/types/iso-date';
import { type Money, ZERO, money, ratioBasisPoints, subMoney } from '../core/types/money';
import type { Result } from '../core/types/result';
import { err } from '../core/types/result';
import type { Budget } from '../core/types/budget';
import { DbConnection } from '../data/db/db-connection';
import { type BudgetProgress, budgetLabel, evaluateBudgets } from '../domain/budget/budget.service';
import { PreferencesService } from '../infra/platform/preferences.service';
import {
  EXPORT_LABEL,
  EXPORT_MIME,
  type ChartImage,
  type ExportOptions,
  buildDocument,
  buildExportModel,
  defaultFileName,
} from '../domain/export';
import { saveBinaryFile } from '../infra/fs/save-file';
import { CHART_EXPORT_BG, CHART_IDS, chartToPng } from '../shared/charts/chart-registry';
import { type AnalyticsSnapshot, type CategoryBreakdown, VARIANCE_PERIODS, computeSnapshot } from '../domain/analytics/analytics.service';
import { type Granularity, historyStart, previousRange } from '../domain/analytics/periods';
import { AppStatusFacade } from './app-status.facade';

export type SortColumn = 'label' | 'count' | 'total' | 'shareOfExpenses' | 'shareOfIncome' | 'average' | 'delta';
export type SortDir = 'asc' | 'desc';

export interface AnalyticsFilters {
  readonly granularity: Granularity;
  readonly range: DateRange;
  readonly categoryIds: readonly string[];
  readonly types: readonly EventType[];
  readonly sortColumn: SortColumn;
  readonly sortDir: SortDir;
}

export type { ExportOptions } from '../domain/export';


/** Rango por defecto del handoff: los últimos 6 meses completos hasta el actual. */
export function defaultRange(today: IsoDate = todayIso()): DateRange {
  return { from: addMonthsClamped(startOfMonth(today), -5, 1), to: endOfMonth(today) };
}

const SORT_KEY: Record<SortColumn, (r: CategoryBreakdown) => number | string> = {
  label: (r) => r.label.toLocaleLowerCase('es'),
  count: (r) => r.count,
  total: (r) => r.total,
  shareOfExpenses: (r) => r.shareOfExpensesBp ?? -1,
  shareOfIncome: (r) => r.shareOfIncomeBp ?? -1,
  average: (r) => r.averagePerEvent ?? -1,
  delta: (r) => r.deltaVsPreviousBp ?? Number.NEGATIVE_INFINITY,
};

/**
 * Analítica: filtros → carga (rango + historia necesaria) → filtro en cliente
 * → `computeSnapshot()` memoizado por signals. Nada se recalcula si no cambia
 * una entrada.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsFacade {
  private readonly db = inject(DbConnection);
  private readonly prefs = inject(PreferencesService);
  private readonly status = inject(AppStatusFacade);

  readonly filters = signal<AnalyticsFilters>({
    granularity: 'month',
    range: defaultRange(),
    categoryIds: [],
    types: [],
    sortColumn: 'total',
    sortDir: 'desc',
  });

  readonly exportOptions = signal<ExportOptions>({
    format: 'xlsx',
    range: defaultRange(),
    includeCharts: true,
    includeBreakdown: true,
    includeRawMovements: false,
  });
  readonly exportModalOpen = signal(false);
  private readonly exportingSig = signal(false);
  readonly exporting = this.exportingSig.asReadonly();

  private readonly eventsSig = signal<readonly Event[]>([]);
  private readonly openingSig = signal<Money>(ZERO);
  private readonly categoriesSig = signal<readonly Category[]>([]);
  private readonly budgetsSig = signal<readonly Budget[]>([]);
  /** Límite de «Gasto total», si existe: alimenta la proyección de cierre y el objetivo de ahorro. */
  private readonly totalBudget = computed(() => this.budgetsSig().find((b) => b.scope === 'total')?.amountCents ?? null);
  private readonly avgIncomeSig = signal<Money | null>(null);
  private readonly loadingSig = signal(true);
  private readonly errorSig = signal<AppError | null>(null);
  /** Rango cargado realmente (con historia), para no recargar si el nuevo rango cabe dentro. */
  private loaded: { from: IsoDate; to: IsoDate } | null = null;

  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly categories = this.categoriesSig.asReadonly();
  readonly categoryById = computed(() => new Map(this.categoriesSig().map((c) => [c.id, c])));
  readonly today = signal<IsoDate>(todayIso());

  /** Movimientos cargados tras aplicar categorías y tipos (filtro en cliente, O(n)). */
  private readonly filteredEvents = computed(() => {
    const { categoryIds, types } = this.filters();
    const cats = new Set(categoryIds);
    const tps = new Set(types);
    let list = this.eventsSig();
    if (tps.size > 0) list = list.filter((e) => tps.has(e.type));
    if (cats.size > 0) list = list.filter((e) => (e.categoryId ? cats.has(e.categoryId) : false));
    return list;
  });

  /** Objetivo de tasa de ahorro derivado del presupuesto y los ingresos medios (Ajustes). */
  readonly savingsTargetBp = computed(() => {
    const avg = this.avgIncomeSig();
    const total = this.totalBudget();
    if (!avg || avg <= 0 || total === null) return null;
    return ratioBasisPoints(subMoney(avg, total), avg);
  });

  readonly snapshot = computed<AnalyticsSnapshot | null>(() => {
    if (this.loadingSig() && this.eventsSig().length === 0) return null;
    const f = this.filters();
    return computeSnapshot({
      events: this.filteredEvents(),
      range: f.range,
      granularity: f.granularity,
      categories: this.categoryById(),
      budgetTargetCents: this.totalBudget() ?? ZERO,
      today: this.today(),
      openingBalanceCents: this.openingSig(),
      savingsTargetBp: this.savingsTargetBp(),
    });
  });

  /**
   * Avance de cada presupuesto en el rango elegido. Usa todos los movimientos
   * del rango, sin los filtros de categoría y tipo: un presupuesto no debe
   * cambiar porque se esté mirando solo una parte de los datos.
   */
  readonly budgets = computed<readonly BudgetProgress[]>(() => {
    const range = this.filters().range;
    const categories = this.categoryById();
    return evaluateBudgets(this.budgetsSig(), this.eventsSig(), range, (scope) => budgetLabel(scope, categories));
  });

  readonly table = computed<readonly CategoryBreakdown[]>(() => {
    const s = this.snapshot();
    if (!s) return [];
    const { sortColumn, sortDir } = this.filters();
    const key = SORT_KEY[sortColumn];
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...s.byCategory].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
    });
  });

  readonly totalsRow = computed<CategoryBreakdown | null>(() => {
    const s = this.snapshot();
    if (!s) return null;
    const prevOutflow = s.comparison.previousOutflow;
    return {
      categoryId: null,
      label: 'Total',
      color: '',
      count: s.outflowCount,
      total: s.outflow,
      shareOfExpensesBp: s.outflow > 0 ? 10000 : null,
      shareOfIncomeBp: s.outflowShareOfIncomeBp,
      averagePerEvent: s.averagePerEvent,
      deltaVsPreviousBp: s.comparison.outflowDeltaBp,
      previousTotal: prevOutflow,
    };
  });

  readonly hasFilters = computed(() => {
    const f = this.filters();
    return f.categoryIds.length > 0 || f.types.length > 0;
  });
  readonly noResults = computed(() => {
    const s = this.snapshot();
    return !!s && s.eventCount === 0 && !this.loadingSig();
  });

  constructor() {
    effect(() => {
      const f = this.filters();
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.ensureLoaded(f.range, f.granularity));
    });
  }

  setGranularity(granularity: Granularity): void {
    this.filters.update((f) => ({ ...f, granularity }));
  }

  setRange(range: DateRange): void {
    if (range.from > range.to) range = { from: range.to, to: range.from };
    this.filters.update((f) => ({ ...f, range }));
    this.exportOptions.update((o) => ({ ...o, range }));
  }

  setCategories(categoryIds: readonly string[]): void {
    this.filters.update((f) => ({ ...f, categoryIds }));
  }

  setTypes(types: readonly EventType[]): void {
    this.filters.update((f) => ({ ...f, types }));
  }

  clearFilters(): void {
    this.filters.update((f) => ({ ...f, categoryIds: [], types: [] }));
  }

  sortBy(column: SortColumn): void {
    this.filters.update((f) => ({
      ...f,
      sortColumn: column,
      sortDir: f.sortColumn === column ? (f.sortDir === 'desc' ? 'asc' : 'desc') : column === 'label' ? 'asc' : 'desc',
    }));
  }

  openExport(format: ExportOptions['format']): void {
    this.exportOptions.update((o) => ({ ...o, format, range: this.filters().range }));
    this.exportModalOpen.set(true);
  }

  /**
   * Genera el documento con el snapshot actual y lo guarda con el diálogo
   * nativo. Devuelve la ruta elegida, o `null` si el usuario cancela.
   */
  async runExport(options: ExportOptions): Promise<Result<string | null>> {
    const snapshot = this.snapshot();
    if (!snapshot) return err(notReady('Todavía no hay datos que exportar.'));
    this.exportingSig.set(true);
    try {
      const charts: ChartImage[] = [];
      if (options.includeCharts) {
        const comparativa = await chartToPng(CHART_IDS.comparativa, CHART_EXPORT_BG);
        if (comparativa) charts.push({ title: 'Ingresos, gastos e inversión por periodo', ...comparativa });
        const saldo = await chartToPng(CHART_IDS.saldo, CHART_EXPORT_BG);
        if (saldo) charts.push({ title: 'Saldo acumulado', ...saldo });
      }
      const model = buildExportModel({
        snapshot,
        events: this.filteredEvents().filter((e) => e.date >= snapshot.range.from && e.date <= snapshot.range.to),
        categories: this.categoryById(),
        options,
        charts,
        dateFormat: this.prefs.dateFormat(),
      });
      const document = await buildDocument(model);
      if (!document.ok) return document;
      return saveBinaryFile({
        defaultName: defaultFileName(options.range, options.format),
        extension: options.format,
        filterName: EXPORT_LABEL[options.format],
        mime: EXPORT_MIME[options.format],
        bytes: document.value,
      });
    } finally {
      this.exportingSig.set(false);
    }
  }

  /** Lee de la BD solo si el rango pedido (con su historia) no está ya cargado. */
  private async ensureLoaded(range: DateRange, granularity: Granularity, force = false): Promise<void> {
    const from = minIso(historyStart(range, granularity, VARIANCE_PERIODS), previousRange(range).from);
    const to = range.to;
    const version = this.status.dataVersion();
    const cached = this.loaded;
    if (!force && cached && cached.from <= from && cached.to >= to && this.lastVersion === version) {
      await this.refreshOpening(range.from);
      return;
    }
    this.lastVersion = version;
    const repos = this.db.require();
    if (!repos.ok) {
      this.errorSig.set(repos.error);
      this.loadingSig.set(false);
      return;
    }
    this.loadingSig.set(true);
    const [events, categories, budgets, avgIncome] = await Promise.all([
      repos.value.events.findInRange({ from, to }),
      repos.value.categories.findAll(),
      repos.value.budgets.findAll(),
      this.loadAverageIncome(),
    ]);
    if (!events.ok) {
      this.errorSig.set(events.error);
      this.loadingSig.set(false);
      return;
    }
    this.errorSig.set(null);
    this.eventsSig.set(events.value);
    this.loaded = { from, to };
    if (categories.ok) this.categoriesSig.set(categories.value);
    if (budgets.ok) this.budgetsSig.set(budgets.value);
    this.avgIncomeSig.set(avgIncome);
    await this.refreshOpening(range.from);
    this.loadingSig.set(false);
  }

  private lastVersion = -1;

  private async refreshOpening(from: IsoDate): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) return;
    const sums = await repos.value.events.sumByTypeBefore(from);
    if (!sums.ok) return;
    let balance = 0;
    for (const [type, total] of sums.value) {
      if (type === 'income') balance += total;
      else if (isOutflow(type)) balance -= total;
    }
    this.openingSig.set(money(balance));
  }

  /** Media de ingresos de los últimos 6 meses completos (para el objetivo de ahorro). */
  private async loadAverageIncome(): Promise<Money | null> {
    const repos = this.db.require();
    if (!repos.ok) return null;
    const today = this.today();
    const from = addMonthsClamped(startOfMonth(today), -6, 1);
    const to = endOfMonth(addMonthsClamped(startOfMonth(today), -1, 1));
    const events = await repos.value.events.findInRange({ from, to }, { types: ['income'] });
    if (!events.ok || events.value.length === 0) return null;
    const total = events.value.reduce((acc, e) => acc + e.amountCents, 0);
    return money(Math.round(total / 6));
  }
}
