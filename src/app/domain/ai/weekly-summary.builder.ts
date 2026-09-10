import { formatWeekLabel } from '../../core/format/date-format';
import { type Currency, activeCurrency } from '../../core/format/money-format';
import type { Category } from '../../core/types/category';
import { EVENT_TYPE_LABEL, type Event, isOutflow } from '../../core/types/event';
import { type DateRange, type IsoDate, endOfIsoWeek, isoWeek, startOfIsoWeek } from '../../core/types/iso-date';
import { type Money, ZERO, money, ratioBasisPoints } from '../../core/types/money';
import type { Recurrence } from '../../core/types/recurrence';
import { balanceOf, outflowOf, totalsByType } from '../analytics/aggregation';
import { EXPENSE_KINDS, EXPENSE_KIND_LABEL, totalsByExpenseKind } from '../analytics/expense-kind';
import { mean } from '../analytics/stats';

/**
 * Resumen compacto y determinista de la semana. Es lo ÚNICO que llega al
 * modelo: nunca se le mandan los movimientos en crudo. Menos tokens, más
 * señal, y funciona en un modelo de 8B.
 *
 * Los importes van en céntimos enteros para que el modelo pueda devolverlos
 * tal cual en `amount_cents` sin inventarse decimales.
 */

export interface CategorySummary {
  readonly name: string;
  readonly total_cents: number;
  readonly count: number;
  /** Media de esa categoría en las 4 semanas previas. */
  readonly avg_4w_cents: number;
  /** Variación frente a esa media, en % con un decimal. `null` si antes era 0. */
  readonly change_pct: number | null;
}

export interface SubscriptionSummary {
  readonly name: string;
  readonly amount_cents: number;
  readonly frequency: string;
}

export interface DeviationSummary {
  readonly what: string;
  readonly detail: string;
  readonly amount_cents: number;
}

export interface TopExpenseSummary {
  readonly concept: string;
  readonly category: string;
  readonly amount_cents: number;
  readonly date: IsoDate;
}

export interface WeeklySummary {
  readonly week: number;
  readonly week_label: string;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly currency: Currency;
  readonly income_cents: number;
  readonly expenses_cents: number;
  readonly balance_cents: number;
  readonly savings_rate_pct: number | null;
  readonly saving_cents: number;
  readonly investment_cents: number;
  readonly movements: number;
  readonly expenses_avg_4w_cents: number;
  readonly expenses_change_vs_avg_pct: number | null;
  readonly by_kind_cents: Readonly<Record<string, number>>;
  readonly by_category: readonly CategorySummary[];
  readonly top_expenses: readonly TopExpenseSummary[];
  readonly active_subscriptions: readonly SubscriptionSummary[];
  readonly subscriptions_monthly_cents: number;
  readonly deviations: readonly DeviationSummary[];
  /** Presupuesto de gasto total del mes, o null si el usuario no ha definido uno. */
  readonly monthly_budget_cents: number | null;
}

export interface WeeklySummaryInput {
  readonly weekStart: IsoDate;
  readonly events: readonly Event[];
  /** Las 4 semanas anteriores, de la más antigua a la más reciente. */
  readonly previousWeeks: readonly (readonly Event[])[];
  readonly activeSubscriptions: readonly Recurrence[];
  readonly categories: ReadonlyMap<string, Category>;
  readonly budgetTargetCents: Money | null;
}

const TOP_EXPENSES = 5;
const MAX_CATEGORIES = 8;
/** Una categoría se marca como desviación si sube más de un 60 % sobre su media. */
const DEVIATION_BP = 6000;

function pct(bp: number | null): number | null {
  return bp === null ? null : Math.round(bp) / 100;
}

function categoryName(e: Event, categories: ReadonlyMap<string, Category>): string {
  if (e.categoryId) return categories.get(e.categoryId)?.name ?? 'Sin categoría';
  return e.type === 'expense' ? 'Sin categoría' : EVENT_TYPE_LABEL[e.type];
}

function outflowByCategory(events: readonly Event[], categories: ReadonlyMap<string, Category>): Map<string, { total: number; count: number }> {
  const map = new Map<string, { total: number; count: number }>();
  for (const e of events) {
    if (!isOutflow(e.type)) continue;
    const key = categoryName(e, categories);
    const acc = map.get(key) ?? { total: 0, count: 0 };
    acc.total += e.amountCents;
    acc.count += 1;
    map.set(key, acc);
  }
  return map;
}

/** Construye el contexto de la semana. Puro: mismos datos, mismo resumen. */
export function buildWeeklySummary(input: WeeklySummaryInput): WeeklySummary {
  const from = startOfIsoWeek(input.weekStart);
  const to = endOfIsoWeek(from);
  const { categories } = input;

  const totals = totalsByType(input.events);
  const outflow = outflowOf(totals);
  const balance = balanceOf(totals);

  const previousOutflows = input.previousWeeks.map((week) => outflowOf(totalsByType(week)));
  const avg4w = mean(previousOutflows) ?? 0;
  const changeBp = avg4w > 0 ? ratioBasisPoints(money(outflow - avg4w), money(avg4w)) : null;

  // Categorías de esta semana y su media en las 4 anteriores.
  const current = outflowByCategory(input.events, categories);
  const previousByCategory = input.previousWeeks.map((week) => outflowByCategory(week, categories));
  const byCategory: CategorySummary[] = [...current.entries()]
    .map(([name, acc]) => {
      const history = previousByCategory.map((week) => week.get(name)?.total ?? 0);
      const avg = mean(history) ?? 0;
      return {
        name,
        total_cents: acc.total,
        count: acc.count,
        avg_4w_cents: avg,
        change_pct: pct(avg > 0 ? ratioBasisPoints(money(acc.total - avg), money(avg)) : null),
      };
    })
    .sort((a, b) => b.total_cents - a.total_cents)
    .slice(0, MAX_CATEGORIES);

  const topExpenses: TopExpenseSummary[] = input.events
    .filter((e) => isOutflow(e.type))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, TOP_EXPENSES)
    .map((e) => ({ concept: e.concept, category: categoryName(e, categories), amount_cents: e.amountCents, date: e.date }));

  const subscriptions: SubscriptionSummary[] = input.activeSubscriptions
    .filter((r) => r.type === 'subscription')
    .map((r) => ({ name: r.concept, amount_cents: r.amountCents, frequency: r.frequency }))
    .sort((a, b) => b.amount_cents - a.amount_cents);
  const subscriptionsMonthly = subscriptions.reduce(
    (acc, s) => acc + (s.frequency === 'yearly' ? Math.round(s.amount_cents / 12) : s.frequency === 'weekly' ? Math.round((s.amount_cents * 52) / 12) : s.amount_cents),
    0,
  );

  // Desviaciones: categorías muy por encima de su media y el gasto único mayor.
  const deviations: DeviationSummary[] = [];
  for (const c of byCategory) {
    if (c.avg_4w_cents > 0 && c.change_pct !== null && c.change_pct >= DEVIATION_BP / 100) {
      deviations.push({
        what: c.name,
        detail: `${c.total_cents} céntimos esta semana frente a una media de ${c.avg_4w_cents} en las 4 semanas anteriores`,
        amount_cents: c.total_cents - c.avg_4w_cents,
      });
    }
  }
  const biggest = topExpenses[0];
  if (biggest && outflow > 0 && biggest.amount_cents * 2 > outflow) {
    deviations.push({
      what: 'Gasto único dominante',
      detail: `«${biggest.concept}» supone más de la mitad del gasto de la semana`,
      amount_cents: biggest.amount_cents,
    });
  }

  const kinds = totalsByExpenseKind(input.events);
  const byKind: Record<string, number> = {};
  for (const kind of EXPENSE_KINDS) byKind[EXPENSE_KIND_LABEL[kind]] = kinds[kind];

  return {
    week: isoWeek(from).week,
    week_label: formatWeekLabel(from),
    from,
    to,
    currency: activeCurrency(),
    income_cents: totals.income,
    expenses_cents: outflow,
    balance_cents: balance,
    savings_rate_pct: pct(totals.income > ZERO ? ratioBasisPoints(balance, totals.income) : null),
    saving_cents: totals.saving,
    investment_cents: totals.investment,
    movements: input.events.length,
    expenses_avg_4w_cents: avg4w,
    expenses_change_vs_avg_pct: pct(changeBp),
    by_kind_cents: byKind,
    by_category: byCategory,
    top_expenses: topExpenses,
    active_subscriptions: subscriptions,
    subscriptions_monthly_cents: subscriptionsMonthly,
    deviations,
    monthly_budget_cents: input.budgetTargetCents,
  };
}

/** Rango de la semana a la que pertenece una fecha. */
export function weekRangeOf(date: IsoDate): DateRange {
  const from = startOfIsoWeek(date);
  return { from, to: endOfIsoWeek(from) };
}
