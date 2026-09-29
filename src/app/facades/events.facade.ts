import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { type AppError, describeError } from '../core/errors/app-error';
import type { Category } from '../core/types/category';
import { type Event, type EventType, balanceSign } from '../core/types/event';
import { type IsoDate, monthRange, startOfMonth, todayIso } from '../core/types/iso-date';
import { type Money, addMoney, money, ZERO } from '../core/types/money';
import { type Result, err, ok } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import { proposePattern } from '../domain/categorization/category-rules';
import { EventService } from '../domain/events/event.service';
import { AppStatusFacade } from './app-status.facade';
import { CategoryRulesFacade } from './category-rules.facade';

export interface DayGroup {
  readonly date: IsoDate;
  readonly items: readonly Event[];
  /** Suma con signo del día (ingresos +, resto −). */
  readonly balance: Money;
}

/** Listado de movimientos del mes visible con filtros de tipo y búsqueda. */
@Injectable({ providedIn: 'root' })
export class EventsFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);
  private readonly rules = inject(CategoryRulesFacade);

  readonly month = signal<IsoDate>(startOfMonth(todayIso()));
  readonly types = signal<readonly EventType[]>([]);
  readonly search = signal('');

  private readonly eventsSig = signal<readonly Event[]>([]);
  private readonly categoriesSig = signal<readonly Category[]>([]);
  private readonly loadingSig = signal(false);
  private readonly errorSig = signal<AppError | null>(null);
  private readonly selectingSig = signal(false);
  private readonly selectedSig = signal<ReadonlySet<string>>(new Set());
  private readonly bulkBusySig = signal(false);

  readonly events = this.eventsSig.asReadonly();
  /** Modo selección: pulsar una fila la marca en vez de abrirla. */
  readonly selecting = this.selectingSig.asReadonly();
  readonly selected = this.selectedSig.asReadonly();
  readonly bulkBusy = this.bulkBusySig.asReadonly();
  readonly categories = this.categoriesSig.asReadonly();
  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();

  readonly categoryById = computed(() => new Map(this.categoriesSig().map((c) => [c.id, c])));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLocaleLowerCase('es');
    if (!q) return this.eventsSig();
    return this.eventsSig().filter((e) => e.concept.toLocaleLowerCase('es').includes(q));
  });

  readonly groupedByDay = computed<readonly DayGroup[]>(() => {
    const groups = new Map<IsoDate, Event[]>();
    for (const e of this.filtered()) {
      const list = groups.get(e.date);
      if (list) list.push(e);
      else groups.set(e.date, [e]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([date, items]) => ({
        date,
        items,
        balance: items.reduce((acc, e) => addMoney(acc, money(balanceSign(e.type) * e.amountCents)), ZERO),
      }));
  });

  readonly total = computed(() => this.filtered().length);
  readonly hasFilters = computed(() => this.types().length > 0 || this.search().trim() !== '');

  /** Los movimientos marcados que siguen a la vista (un filtro puede ocultar alguno). */
  readonly selectedEvents = computed(() => {
    const ids = this.selectedSig();
    return ids.size === 0 ? [] : this.filtered().filter((e) => ids.has(e.id));
  });
  readonly selectedCount = computed(() => this.selectedEvents().length);
  readonly allVisibleSelected = computed(() => {
    const visible = this.filtered();
    return visible.length > 0 && visible.every((e) => this.selectedSig().has(e.id));
  });

  /**
   * Categorías que se pueden asignar a la selección: las de gasto si todo son
   * salidas, las de ingreso si todo son ingresos, y solo las «ambos» si se
   * mezclan. Ahorro e inversión no llevan categoría y quedan fuera.
   */
  readonly bulkCategories = computed<readonly Category[]>(() => {
    const kinds = new Set(this.selectedEvents().map((e) => (e.type === 'income' ? 'income' : 'expense')));
    return this.categoriesSig().filter((c) => c.kind === 'both' || (kinds.size === 1 && kinds.has(c.kind as 'expense' | 'income')));
  });

  /** Texto que se propone para «Recordar como regla» a partir de los conceptos marcados. */
  readonly proposedPattern = computed(() => proposePattern(this.selectedEvents().map((e) => e.concept)));

  constructor() {
    // Recarga cuando cambian mes, tipos o los datos (guardar, borrar, materializar).
    effect(() => {
      const month = this.month();
      const types = this.types();
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.load(month, types));
    });
  }

  clearFilters(): void {
    this.types.set([]);
    this.search.set('');
  }

  startSelecting(): void {
    this.selectingSig.set(true);
  }

  stopSelecting(): void {
    this.selectingSig.set(false);
    this.selectedSig.set(new Set());
  }

  toggleSelected(id: string): void {
    this.selectedSig.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  selectAllVisible(checked: boolean): void {
    this.selectedSig.set(checked ? new Set(this.filtered().map((e) => e.id)) : new Set());
  }

  /**
   * Cambia la categoría de la selección y, si se pide, guarda una regla para
   * que los próximos movimientos con ese texto la reciban solos. La regla se
   * guarda antes de recategorizar para que «Aplicar» cuente el acierto.
   */
  async recategorizeSelected(categoryId: string, rememberPattern: string | null): Promise<Result<{ readonly updated: number }>> {
    const ids = this.selectedEvents()
      .filter((e) => e.type !== 'saving' && e.type !== 'investment')
      .map((e) => e.id);
    const repos = this.db.require();
    if (!repos.ok) return repos;
    this.bulkBusySig.set(true);
    try {
      if (rememberPattern && rememberPattern.trim()) {
        const rule = await this.rules.remember(rememberPattern, categoryId);
        if (!rule.ok) return rule;
      }
      const result = await repos.value.events.updateCategoryMany(ids, categoryId);
      if (!result.ok) {
        this.status.notify(describeError(result.error), 'expense');
        return result;
      }
      const n = result.value.updated;
      this.status.notify(n === 1 ? 'Se cambió la categoría de 1 movimiento.' : `Se cambió la categoría de ${n} movimientos.`, 'income');
      this.stopSelecting();
      this.status.touch();
      return ok(result.value);
    } finally {
      this.bulkBusySig.set(false);
    }
  }

  async deleteSelected(): Promise<Result<{ readonly deleted: number }>> {
    const ids = this.selectedEvents().map((e) => e.id);
    const repos = this.db.require();
    if (!repos.ok) return repos;
    this.bulkBusySig.set(true);
    const result = await repos.value.events.deleteMany(ids);
    this.bulkBusySig.set(false);
    if (!result.ok) {
      this.status.notify(describeError(result.error), 'expense');
      return result;
    }
    const n = result.value.deleted;
    this.status.notify(n === 1 ? 'Se eliminó 1 movimiento.' : `Se eliminaron ${n} movimientos.`);
    this.stopSelecting();
    this.status.touch();
    return ok(result.value);
  }

  async remove(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const result = await new EventService(repos.value).remove(id);
    if (result.ok) this.status.touch();
    return result;
  }

  private async load(month: IsoDate, types: readonly EventType[]): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) {
      this.errorSig.set(repos.error);
      return;
    }
    this.loadingSig.set(true);
    const [events, categories] = await Promise.all([
      repos.value.events.findInRange(monthRange(month), { types }),
      repos.value.categories.findAll(),
    ]);
    this.loadingSig.set(false);
    if (!events.ok) {
      this.errorSig.set(events.error);
      return;
    }
    this.errorSig.set(null);
    this.eventsSig.set(events.value);
    if (categories.ok) this.categoriesSig.set(categories.value);
  }
}

export function okOrError<T>(r: Result<T>): Result<T> {
  return r.ok ? ok(r.value) : err(r.error);
}
