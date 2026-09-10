import { EVENT_TYPES, type Event, type EventType, isOutflow } from '../../core/types/event';
import {
  type DateRange,
  type IsoDate,
  addDays,
  addMonthsClamped,
  endOfIsoWeek,
  endOfMonth,
  minIso,
  monthKey,
  startOfIsoWeek,
  startOfMonth,
} from '../../core/types/iso-date';
import { type Money, ZERO, addMoney, money, subMoney } from '../../core/types/money';

/** Totales por tipo (todos positivos; el signo lo da el tipo). */
export type TypeTotals = Readonly<Record<EventType, Money>>;

export const EMPTY_TOTALS: TypeTotals = {
  expense: ZERO,
  income: ZERO,
  subscription: ZERO,
  direct_debit: ZERO,
  saving: ZERO,
  investment: ZERO,
};

export function totalsByType(events: Iterable<Event>): TypeTotals {
  const acc: Record<EventType, number> = { expense: 0, income: 0, subscription: 0, direct_debit: 0, saving: 0, investment: 0 };
  for (const e of events) acc[e.type] += e.amountCents;
  const out = {} as Record<EventType, Money>;
  for (const t of EVENT_TYPES) out[t] = money(acc[t]);
  return out;
}

/** Gasto = gasto + suscripciones + domiciliaciones. Ahorro e inversión son traspasos, no gasto. */
export function outflowOf(t: TypeTotals): Money {
  return addMoney(addMoney(t.expense, t.subscription), t.direct_debit);
}

/**
 * Balance del mes = ingresos − gasto (handoff: 2.752,68 − 1.884,37 = +868,31;
 * ahorro e inversión no restan porque siguen siendo dinero del usuario).
 */
export function balanceOf(t: TypeTotals): Money {
  return subMoney(t.income, outflowOf(t));
}

export function sumOutflow(events: Iterable<Event>): Money {
  let total = 0;
  for (const e of events) if (isOutflow(e.type)) total += e.amountCents;
  return money(total);
}

/** Semanas (lunes a domingo) recortadas al mes, en orden: S1…Sn. */
export function weeksOfMonth(anyDayOfMonth: IsoDate): readonly DateRange[] {
  const first = startOfMonth(anyDayOfMonth);
  const last = endOfMonth(anyDayOfMonth);
  const weeks: DateRange[] = [];
  let cursor = first;
  while (cursor <= last) {
    const to = minIso(endOfIsoWeek(cursor), last);
    weeks.push({ from: cursor, to });
    cursor = addDays(to, 1);
  }
  return weeks;
}

export interface WeekBucket {
  readonly label: string;
  readonly range: DateRange;
  readonly events: readonly Event[];
}

export function bucketByWeek(events: readonly Event[], anyDayOfMonth: IsoDate): readonly WeekBucket[] {
  const weeks = weeksOfMonth(anyDayOfMonth);
  const buckets: Event[][] = weeks.map(() => []);
  for (const e of events) {
    const idx = weeks.findIndex((w) => e.date >= w.from && e.date <= w.to);
    if (idx >= 0) buckets[idx]?.push(e);
  }
  return weeks.map((range, i) => ({ label: `S${i + 1}`, range, events: buckets[i] ?? [] }));
}

/** Los `n` meses que terminan en el mes dado, como primer día de cada uno, en orden cronológico. */
export function lastMonths(anyDayOfMonth: IsoDate, n: number): readonly IsoDate[] {
  const start = startOfMonth(anyDayOfMonth);
  return Array.from({ length: n }, (_, i) => addMonthsClamped(start, i - (n - 1), 1));
}

/** Totales por tipo de cada mes de `months` (claves 'YYYY-MM'). */
export function totalsByMonth(events: readonly Event[], months: readonly IsoDate[]): ReadonlyMap<string, TypeTotals> {
  const groups = new Map<string, Event[]>();
  for (const m of months) groups.set(monthKey(m), []);
  for (const e of events) groups.get(monthKey(e.date))?.push(e);
  return new Map([...groups.entries()].map(([k, list]) => [k, totalsByType(list)]));
}

/** Semana ISO del año a la que pertenece un día, como rango. */
export function isoWeekOf(d: IsoDate): DateRange {
  return { from: startOfIsoWeek(d), to: endOfIsoWeek(d) };
}
