import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import type { AppError } from '../core/errors/app-error';
import { MESES } from '../core/format/date-format';
import { formatBasisPoints } from '../core/format/percent-format';
import { formatMoney } from '../core/format/money-format';
import type { Category } from '../core/types/category';
import { EVENT_TYPE_LABEL, type Event, type EventType, type SemanticColor } from '../core/types/event';
import {
  type IsoDate,
  addDays,
  addMonthsClamped,
  daysBetween,
  endOfMonth,
  month,
  monthKey,
  monthRange,
  startOfMonth,
  todayIso,
} from '../core/types/iso-date';
import { type Money, ZERO, ratioBasisPoints, subMoney, sumMoney } from '../core/types/money';
import type { Recurrence } from '../core/types/recurrence';
import { DbConnection } from '../data/db/db-connection';
import {
  EMPTY_TOTALS,
  type TypeTotals,
  balanceOf,
  bucketByWeek,
  lastMonths,
  outflowOf,
  totalsByMonth,
  totalsByType,
} from '../domain/analytics/aggregation';
import { EXPENSE_KINDS, EXPENSE_KIND_LABEL, type ExpenseKind, type ExpenseKindTotals, totalsByExpenseKind } from '../domain/analytics/expense-kind';
import { type BudgetPace, computeBudgetPace } from '../domain/budget/budget.service';
import { expand } from '../domain/recurrence/recurrence.service';
import { FT_COLORS } from '../shared/charts/palette';
import type { KpiEstado } from '../shared/components/tarjeta-kpi/tarjeta-kpi';
import { AppStatusFacade } from './app-status.facade';

export interface KpiCard {
  readonly key: 'income' | 'expense' | 'saving' | 'investment';
  readonly label: string;
  readonly value: string;
  readonly foot: string;
  readonly color: SemanticColor;
  readonly sparkline: readonly number[];
  readonly estado: KpiEstado;
}

export interface WeekStack {
  readonly label: string;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly total: Money;
  readonly segments: ExpenseKindTotals;
}

export interface DonutSlice {
  readonly kind: ExpenseKind;
  readonly label: string;
  readonly amount: Money;
  readonly shareBp: number | null;
  readonly color: string;
}

export interface UpcomingCharge {
  readonly concept: string;
  readonly date: IsoDate;
  readonly type: EventType;
  readonly typeLabel: string;
  readonly amountCents: Money;
  readonly daysUntil: number;
}

const UPCOMING_DAYS = 30;
const RECENT_LIMIT = 6;
const SPARKLINE_MONTHS = 6;

/** Todo el dashboard se deriva de los movimientos de los últimos 6 meses y las reglas activas. */
@Injectable({ providedIn: 'root' })
export class DashboardFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);

  readonly month = signal<IsoDate>(startOfMonth(todayIso()));
  readonly today = signal<IsoDate>(todayIso());

  private readonly eventsSig = signal<readonly Event[]>([]);
  private readonly rulesSig = signal<readonly Recurrence[]>([]);
  private readonly categoriesSig = signal<readonly Category[]>([]);
  /** Límite de «Gasto total» (Ajustes → Presupuestos), o 0 si no hay: sin él no hay aviso de proyección. */
  private readonly budgetSig = signal<Money>(ZERO);
  private readonly loadingSig = signal(true);
  private readonly errorSig = signal<AppError | null>(null);
  /**
   * Mes al que pertenecen los datos cargados. Los derivados leen este y no
   * `month`, para que al cambiar de mes la vista siga mostrando el anterior
   * (atenuado) hasta que llegan los datos nuevos, en vez de pasar por ceros
   * o por el skeleton.
   */
  private readonly shownMonthSig = signal<IsoDate | null>(null);
  private loadSeq = 0;
  private readonly shownMonth = computed(() => this.shownMonthSig() ?? this.month());

  readonly loading = this.loadingSig.asReadonly();
  /** Primera carga: aún no hay nada que enseñar y toca skeleton. */
  readonly initialLoading = computed(() => this.loadingSig() && this.shownMonthSig() === null);
  /** Recarga con datos ya en pantalla: se atenúan en vez de desaparecer. */
  readonly refreshing = computed(() => this.loadingSig() && this.shownMonthSig() !== null);
  readonly error = this.errorSig.asReadonly();
  readonly categoryById = computed(() => new Map(this.categoriesSig().map((c) => [c.id, c])));

  readonly monthEvents = computed(() => {
    const { from, to } = monthRange(this.shownMonth());
    return this.eventsSig().filter((e) => e.date >= from && e.date <= to);
  });
  readonly count = computed(() => this.monthEvents().length);
  readonly empty = computed(() => this.shownMonthSig() !== null && this.count() === 0);

  private readonly prevMonthEvents = computed(() => {
    const { from, to } = monthRange(addMonthsClamped(this.shownMonth(), -1, 1));
    return this.eventsSig().filter((e) => e.date >= from && e.date <= to);
  });

  readonly totals = computed<TypeTotals>(() => totalsByType(this.monthEvents()));
  private readonly prevTotals = computed<TypeTotals>(() => totalsByType(this.prevMonthEvents()));

  readonly balance = computed(() => balanceOf(this.totals()));
  readonly outflow = computed(() => outflowOf(this.totals()));
  readonly delta = computed(() => subMoney(this.balance(), balanceOf(this.prevTotals())));
  readonly prevBalance = computed(() => balanceOf(this.prevTotals()));
  readonly prevMonthName = computed(() => MESES[month(addMonthsClamped(this.shownMonth(), -1, 1)) - 1] ?? '');

  private readonly series6m = computed(() => {
    const months = lastMonths(this.shownMonth(), SPARKLINE_MONTHS);
    const byMonth = totalsByMonth(this.eventsSig(), months);
    const pick = (f: (t: TypeTotals) => Money) => months.map((m) => f(byMonth.get(monthKey(m)) ?? EMPTY_TOTALS));
    return {
      income: pick((t) => t.income),
      expense: pick(outflowOf),
      saving: pick((t) => t.saving),
      investment: pick((t) => t.investment),
    };
  });

  readonly pace = computed<BudgetPace>(() =>
    computeBudgetPace({
      outflow: this.outflow(),
      income: this.totals().income,
      budgetTarget: this.budgetSig(),
      monthStart: this.shownMonth(),
      today: this.today(),
    }),
  );

  readonly kpis = computed<readonly KpiCard[]>(() => {
    const t = this.totals();
    const income = t.income;
    const s = this.series6m();
    const pct = (amount: Money) => {
      const bp = ratioBasisPoints(amount, income);
      return bp === null ? 'Sin ingresos' : `${formatBasisPoints(bp, { decimals: bp === 10000 ? 0 : 1 })} de ingresos`;
    };
    const pace = this.pace();
    const expenseError = pace.overBudget && pace.projectedClose !== null;
    return [
      { key: 'income', label: 'Ingresos', value: formatMoney(income), foot: pct(income), color: 'income', sparkline: s.income, estado: 'normal' },
      {
        key: 'expense',
        label: 'Gastos',
        value: formatMoney(this.outflow()),
        foot: expenseError
          ? `Proyección ${formatMoney(pace.projectedClose ?? ZERO)} · supera el objetivo`
          : pct(this.outflow()),
        color: 'expense',
        sparkline: s.expense,
        estado: expenseError ? 'error' : 'normal',
      },
      { key: 'saving', label: 'Ahorro', value: formatMoney(t.saving), foot: pct(t.saving), color: 'savings', sparkline: s.saving, estado: 'normal' },
      { key: 'investment', label: 'Inversión', value: formatMoney(t.investment), foot: pct(t.investment), color: 'investment', sparkline: s.investment, estado: 'normal' },
    ];
  });

  readonly weeks = computed<readonly WeekStack[]>(() =>
    bucketByWeek(this.monthEvents(), this.shownMonth()).map((b) => {
      const segments = totalsByExpenseKind(b.events);
      return {
        label: b.label,
        from: b.range.from,
        to: b.range.to,
        total: sumMoney(EXPENSE_KINDS.map((k) => segments[k])),
        segments,
      };
    }),
  );

  readonly kinds = computed(() => totalsByExpenseKind(this.monthEvents()));

  readonly donut = computed<readonly DonutSlice[]>(() => {
    const kinds = this.kinds();
    const total = this.outflow();
    return EXPENSE_KINDS.map((kind, i) => ({
      kind,
      label: EXPENSE_KIND_LABEL[kind],
      amount: kinds[kind],
      shareBp: ratioBasisPoints(kinds[kind], total),
      color: FT_COLORS.expenseRamp[i] ?? FT_COLORS.expense,
    }));
  });

  private readonly upcomingAll = computed<readonly UpcomingCharge[]>(() => {
    const today = this.today();
    const from = addDays(today, 1);
    const to = addDays(today, UPCOMING_DAYS);
    return this.rulesSig()
      .filter((r) => r.type !== 'income')
      .flatMap((r) => expand(r, from, to))
      .map((v) => ({
        concept: v.concept,
        date: v.date,
        type: v.type,
        typeLabel: EVENT_TYPE_LABEL[v.type],
        amountCents: v.amountCents,
        daysUntil: daysBetween(today, v.date),
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  });

  readonly upcoming = computed(() => this.upcomingAll().slice(0, 5));
  readonly upcomingTotal = computed(() => sumMoney(this.upcomingAll().map((u) => u.amountCents)));
  readonly upcomingDays = UPCOMING_DAYS;

  readonly recent = computed(() => this.monthEvents().slice(0, RECENT_LIMIT));

  constructor() {
    effect(() => {
      const month = this.month();
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.load(month));
    });
  }

  prevMonth(): void {
    this.month.update((m) => addMonthsClamped(m, -1, 1));
  }

  nextMonth(): void {
    this.month.update((m) => addMonthsClamped(m, 1, 1));
  }

  goToday(): void {
    this.today.set(todayIso());
    this.month.set(startOfMonth(this.today()));
  }

  private async load(month: IsoDate): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) {
      this.errorSig.set(repos.error);
      this.loadingSig.set(false);
      return;
    }
    const seq = ++this.loadSeq;
    this.loadingSig.set(true);
    const from = lastMonths(month, SPARKLINE_MONTHS)[0] ?? startOfMonth(month);
    const [events, rules, budgets, categories] = await Promise.all([
      repos.value.events.findInRange({ from, to: endOfMonth(month) }),
      repos.value.recurrences.findAll({ activeOnly: true }),
      repos.value.budgets.findAll(),
      repos.value.categories.findAll(),
    ]);
    // Ya se pidió otra carga (cambio rápido de mes, otro guardado): esta llega tarde y se descarta.
    if (seq !== this.loadSeq) return;
    this.loadingSig.set(false);
    if (!events.ok) {
      this.errorSig.set(events.error);
      return;
    }
    this.errorSig.set(null);
    this.eventsSig.set(events.value);
    if (rules.ok) this.rulesSig.set(rules.value);
    if (budgets.ok) this.budgetSig.set(budgets.value.find((b) => b.scope === 'total')?.amountCents ?? ZERO);
    if (categories.ok) this.categoriesSig.set(categories.value);
    this.shownMonthSig.set(month);
  }
}
