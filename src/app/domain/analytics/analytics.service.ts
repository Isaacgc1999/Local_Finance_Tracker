import type { Category } from '../../core/types/category';
import { EVENT_TYPE_LABEL, type Event, type EventType, isOutflow } from '../../core/types/event';
import {
  type DateRange,
  type IsoDate,
  addDays,
  daysBetween,
  monthKey,
  monthRange,
  rangeLengthDays,
} from '../../core/types/iso-date';
import { type Money, ZERO, money, ratioBasisPoints, subMoney } from '../../core/types/money';
import { type BudgetPace, computeBudgetPace } from '../budget/budget.service';
import { type TypeTotals, balanceOf, outflowOf, totalsByType } from './aggregation';
import { type ExpenseKindTotals, totalsByExpenseKind } from './expense-kind';
import { type Granularity, type Period, historyStart, periodKeyOf, periodsBetween, previousRange } from './periods';
import { mean, median, movingAverage, varianceAndStdDev } from './stats';

/** Periodos anteriores con los que se compara el gasto («varianza vs. media 3 m»). */
export const VARIANCE_PERIODS = 3;

export interface AnalyticsInput {
  /**
   * Movimientos de `[historyStart, range.to]`, ya filtrados por categorías y
   * tipos. El servicio separa el rango, el periodo anterior y los 3 periodos
   * previos por fecha.
   */
  readonly events: readonly Event[];
  readonly range: DateRange;
  readonly granularity: Granularity;
  readonly categories: ReadonlyMap<string, Category>;
  readonly budgetTargetCents: Money;
  readonly today: IsoDate;
  /** Balance acumulado de todo lo anterior a `range.from` (para «Saldo actual»). */
  readonly openingBalanceCents: Money;
  /** Objetivo de tasa de ahorro en puntos básicos (derivado del presupuesto), o null. */
  readonly savingsTargetBp: number | null;
}

export interface PeriodPoint extends Period {
  readonly income: Money;
  readonly outflow: Money;
  readonly saving: Money;
  readonly investment: Money;
  readonly balance: Money;
  /** Saldo acumulado al cierre del periodo (incluye el saldo inicial). */
  readonly cumulative: Money;
}

export interface DailyPoint {
  readonly date: IsoDate;
  readonly balance: Money;
  readonly cumulative: Money;
}

export interface CategoryBreakdown {
  /** `null` para los grupos sin categoría (agrupados por tipo). */
  readonly categoryId: string | null;
  readonly label: string;
  readonly color: string;
  readonly count: number;
  readonly total: Money;
  readonly shareOfExpensesBp: number | null;
  readonly shareOfIncomeBp: number | null;
  readonly averagePerEvent: Money | null;
  /** Variación frente al mismo grupo en el periodo anterior; null si antes era 0. */
  readonly deltaVsPreviousBp: number | null;
  readonly previousTotal: Money;
}

export interface VarianceStats {
  readonly currentOutflow: Money;
  readonly previousOutflows: readonly Money[];
  readonly previousMean: Money | null;
  readonly varianceCents2: number | null;
  readonly stdDevCents: number | null;
  /** (actual − media) / media, en puntos básicos. */
  readonly deltaBp: number | null;
}

export interface PeriodComparison {
  readonly previous: TypeTotals;
  readonly previousOutflow: Money;
  readonly previousIncome: Money;
  readonly outflowDeltaAbs: Money;
  readonly outflowDeltaBp: number | null;
  readonly incomeDeltaAbs: Money;
  readonly incomeDeltaBp: number | null;
}

/** Instantánea inmutable con todo lo que muestra la pantalla de Analítica. */
export interface AnalyticsSnapshot {
  readonly range: DateRange;
  readonly granularity: Granularity;
  readonly days: number;
  readonly eventCount: number;
  readonly outflowCount: number;
  readonly totals: TypeTotals;
  readonly income: Money;
  readonly outflow: Money;
  readonly balance: Money;
  readonly outflowShareOfIncomeBp: number | null;
  readonly savingsRateBp: number | null;
  readonly savingsTargetBp: number | null;
  readonly byExpenseKind: ExpenseKindTotals;
  readonly byCategory: readonly CategoryBreakdown[];
  readonly dailyAverage: Money | null;
  readonly medianPerEvent: Money | null;
  readonly averagePerEvent: Money | null;
  readonly variance: VarianceStats;
  readonly periods: readonly PeriodPoint[];
  readonly movingAverage3Periods: readonly (Money | null)[];
  readonly daily: readonly DailyPoint[];
  readonly movingAverage7: readonly (Money | null)[];
  readonly movingAverage30: readonly (Money | null)[];
  readonly openingBalance: Money;
  readonly currentBalance: Money;
  readonly balanceVariation: Money;
  readonly comparison: PeriodComparison;
  readonly burn: BudgetPace | null;
}

const UNCATEGORIZED_COLOR = '#6B7280';

function within(e: Event, r: DateRange): boolean {
  return e.date >= r.from && e.date <= r.to;
}

function groupKey(e: Event): string {
  return e.categoryId ?? `__type:${e.type}`;
}

function groupLabel(key: string, categories: ReadonlyMap<string, Category>): { readonly label: string; readonly color: string } {
  if (key.startsWith('__type:')) {
    const type = key.slice(7) as EventType;
    const label = type === 'expense' ? 'Sin categoría' : `${EVENT_TYPE_LABEL[type]}s`.replace('Domiciliacións', 'Domiciliaciones').replace('Suscripcións', 'Suscripciones');
    return { label, color: UNCATEGORIZED_COLOR };
  }
  const c = categories.get(key);
  return { label: c?.name ?? 'Categoría eliminada', color: c?.color ?? UNCATEGORIZED_COLOR };
}

/** Recorre una vez los movimientos y calcula todas las métricas. O(n log n) por la mediana. */
export function computeSnapshot(input: AnalyticsInput): AnalyticsSnapshot {
  const { range, granularity: g, categories } = input;
  const prevRange = previousRange(range);
  const varianceFrom = historyStart(range, g, VARIANCE_PERIODS);

  // ── Periodos del rango y de los 3 anteriores (para la varianza) ──────────
  const periods = periodsBetween(range, g);
  const periodIndex = new Map(periods.map((p, i) => [p.key, i]));
  // Las fechas se repiten mucho (10.000 movimientos → ~1.000 días): clave por fecha memorizada.
  const keyCache = new Map<IsoDate, string>();
  const keyOf = (date: IsoDate): string => {
    let k = keyCache.get(date);
    if (k === undefined) {
      k = periodKeyOf(date, g);
      keyCache.set(date, k);
    }
    return k;
  };
  const pInc = new Array<number>(periods.length).fill(0);
  const pOut = new Array<number>(periods.length).fill(0);
  const pSav = new Array<number>(periods.length).fill(0);
  const pInv = new Array<number>(periods.length).fill(0);
  const priorOut = new Map<string, number>();

  // ── Acumuladores del rango ──────────────────────────────────────────────
  const inRange: Event[] = [];
  const prevEvents: Event[] = [];
  const dailyBalance = new Map<IsoDate, number>();
  const outflowAmounts: number[] = [];
  const catCurrent = new Map<string, { count: number; total: number }>();
  const catPrevious = new Map<string, number>();

  for (const e of input.events) {
    if (within(e, range)) {
      inRange.push(e);
      const sign = e.type === 'income' ? 1 : isOutflow(e.type) ? -1 : 0;
      if (sign !== 0) dailyBalance.set(e.date, (dailyBalance.get(e.date) ?? 0) + sign * e.amountCents);
      const idx = periodIndex.get(keyOf(e.date));
      if (idx !== undefined) {
        if (e.type === 'income') pInc[idx] = (pInc[idx] ?? 0) + e.amountCents;
        else if (isOutflow(e.type)) pOut[idx] = (pOut[idx] ?? 0) + e.amountCents;
        else if (e.type === 'saving') pSav[idx] = (pSav[idx] ?? 0) + e.amountCents;
        else pInv[idx] = (pInv[idx] ?? 0) + e.amountCents;
      }
      if (isOutflow(e.type)) {
        outflowAmounts.push(e.amountCents);
        const key = groupKey(e);
        const acc = catCurrent.get(key) ?? { count: 0, total: 0 };
        acc.count += 1;
        acc.total += e.amountCents;
        catCurrent.set(key, acc);
      }
    } else if (within(e, prevRange)) {
      prevEvents.push(e);
      if (isOutflow(e.type)) {
        const key = groupKey(e);
        catPrevious.set(key, (catPrevious.get(key) ?? 0) + e.amountCents);
      }
    }
    if (isOutflow(e.type) && e.date >= varianceFrom && e.date < range.from) {
      const key = keyOf(e.date);
      priorOut.set(key, (priorOut.get(key) ?? 0) + e.amountCents);
    }
  }

  const totals = totalsByType(inRange);
  const income = totals.income;
  const outflow = outflowOf(totals);
  const balance = balanceOf(totals);
  const days = rangeLengthDays(range);

  // ── Series por periodo + saldo acumulado ───────────────────────────────
  let cumulative = input.openingBalanceCents as number;
  const periodPoints: PeriodPoint[] = periods.map((p, i) => {
    const inc = pInc[i] ?? 0;
    const out = pOut[i] ?? 0;
    cumulative += inc - out;
    return {
      ...p,
      income: money(inc),
      outflow: money(out),
      saving: money(pSav[i] ?? 0),
      investment: money(pInv[i] ?? 0),
      balance: money(inc - out),
      cumulative: money(cumulative),
    };
  });
  const ma3 = movingAverage(periodPoints.map((p) => p.cumulative), VARIANCE_PERIODS).map((v) => (v === null ? null : money(v)));

  // ── Serie diaria + medias móviles de 7 y 30 días ───────────────────────
  const daily: DailyPoint[] = [];
  let dailyCum = input.openingBalanceCents as number;
  for (let d = range.from, i = 0; d <= range.to && i < 100_000; d = addDays(d, 1), i++) {
    const b = dailyBalance.get(d) ?? 0;
    dailyCum += b;
    daily.push({ date: d, balance: money(b), cumulative: money(dailyCum) });
  }
  const dailyCumulative = daily.map((p) => p.cumulative);
  const toMoney = (v: number | null) => (v === null ? null : money(v));
  const ma7 = movingAverage(dailyCumulative, 7).map(toMoney);
  const ma30 = movingAverage(dailyCumulative, 30).map(toMoney);

  // ── Categorías ─────────────────────────────────────────────────────────
  const byCategory: CategoryBreakdown[] = [...catCurrent.entries()].map(([key, acc]) => {
    const previous = catPrevious.get(key) ?? 0;
    const { label, color } = groupLabel(key, categories);
    return {
      categoryId: key.startsWith('__type:') ? null : key,
      label,
      color,
      count: acc.count,
      total: money(acc.total),
      shareOfExpensesBp: ratioBasisPoints(money(acc.total), outflow),
      shareOfIncomeBp: ratioBasisPoints(money(acc.total), income),
      averagePerEvent: acc.count > 0 ? money(Math.round(acc.total / acc.count)) : null,
      deltaVsPreviousBp: previous > 0 ? ratioBasisPoints(money(acc.total - previous), money(previous)) : null,
      previousTotal: money(previous),
    };
  });
  byCategory.sort((a, b) => b.total - a.total);

  // ── Varianza frente a los 3 periodos anteriores ────────────────────────
  const lastPeriod = periodPoints[periodPoints.length - 1];
  const currentOutflow = lastPeriod?.outflow ?? ZERO;
  const previousKeys: string[] = [];
  if (lastPeriod) {
    // Los periodos del propio rango que preceden al último, y si faltan, los anteriores al rango.
    for (let i = periodPoints.length - 2; i >= 0 && previousKeys.length < VARIANCE_PERIODS; i--) {
      previousKeys.unshift(periodPoints[i]?.key ?? '');
    }
    let start = historyStart(range, g, 1);
    let guard = 0;
    while (previousKeys.length < VARIANCE_PERIODS && guard++ < VARIANCE_PERIODS) {
      previousKeys.unshift(periodKeyOf(start, g));
      start = historyStart({ from: start, to: start }, g, 1);
    }
  }
  const previousOutflows = previousKeys.map((k) => {
    const idx = periodIndex.get(k);
    return money(idx !== undefined ? (pOut[idx] ?? 0) : (priorOut.get(k) ?? 0));
  });
  const prevMean = mean(previousOutflows);
  const dispersion = varianceAndStdDev(previousOutflows);
  const variance: VarianceStats = {
    currentOutflow,
    previousOutflows,
    previousMean: prevMean === null ? null : money(prevMean),
    varianceCents2: dispersion?.variance ?? null,
    stdDevCents: dispersion?.stdDev ?? null,
    deltaBp: prevMean !== null && prevMean > 0 ? ratioBasisPoints(money(currentOutflow - prevMean), money(prevMean)) : null,
  };

  // ── Comparativa con el periodo anterior ────────────────────────────────
  const previous = totalsByType(prevEvents);
  const previousOutflow = outflowOf(previous);
  const comparison: PeriodComparison = {
    previous,
    previousOutflow,
    previousIncome: previous.income,
    outflowDeltaAbs: subMoney(outflow, previousOutflow),
    outflowDeltaBp: previousOutflow > 0 ? ratioBasisPoints(subMoney(outflow, previousOutflow), previousOutflow) : null,
    incomeDeltaAbs: subMoney(income, previous.income),
    incomeDeltaBp: previous.income > 0 ? ratioBasisPoints(subMoney(income, previous.income), previous.income) : null,
  };

  // ── Burn rate del mes en curso (si el rango lo incluye) ────────────────
  let burn: BudgetPace | null = null;
  if (monthKey(input.today) >= monthKey(range.from) && monthKey(input.today) <= monthKey(range.to)) {
    const m = monthRange(input.today);
    const monthTotals = totalsByType(inRange.filter((e) => within(e, m)));
    burn = computeBudgetPace({
      outflow: outflowOf(monthTotals),
      income: monthTotals.income,
      budgetTarget: input.budgetTargetCents,
      monthStart: m.from,
      today: input.today,
    });
  }

  const currentBalance = lastPeriod?.cumulative ?? input.openingBalanceCents;

  return {
    range,
    granularity: g,
    days,
    eventCount: inRange.length,
    outflowCount: outflowAmounts.length,
    totals,
    income,
    outflow,
    balance,
    outflowShareOfIncomeBp: ratioBasisPoints(outflow, income),
    savingsRateBp: income > 0 ? ratioBasisPoints(balance, income) : null,
    savingsTargetBp: input.savingsTargetBp,
    byExpenseKind: totalsByExpenseKind(inRange),
    byCategory,
    dailyAverage: days > 0 ? money(Math.round(outflow / days)) : null,
    medianPerEvent: toMoney(median(outflowAmounts)),
    averagePerEvent: outflowAmounts.length > 0 ? money(Math.round(outflow / outflowAmounts.length)) : null,
    variance,
    periods: periodPoints,
    movingAverage3Periods: ma3,
    daily,
    movingAverage7: ma7,
    movingAverage30: ma30,
    openingBalance: input.openingBalanceCents,
    currentBalance,
    balanceVariation: subMoney(currentBalance, input.openingBalanceCents),
    comparison,
    burn,
  };
}

/** Días entre dos fechas, expuesto para las etiquetas («183 días»). */
export function daysOf(range: DateRange): number {
  return daysBetween(range.from, range.to) + 1;
}
