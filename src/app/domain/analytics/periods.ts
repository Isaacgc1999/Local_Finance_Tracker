import { formatDayMonth, formatDayMonthYear, formatMonthAxis, formatMonthYear, formatWeekLabel } from '../../core/format/date-format';
import {
  type DateRange,
  type IsoDate,
  addDays,
  addMonthsClamped,
  addWeeks,
  addYearsClamped,
  daysBetween,
  endOfIsoWeek,
  endOfMonth,
  endOfYear,
  isoWeek,
  isoWeekKey,
  maxIso,
  minIso,
  monthKey,
  startOfIsoWeek,
  startOfMonth,
  startOfYear,
  year,
} from '../../core/types/iso-date';

export type Granularity = 'day' | 'week' | 'month' | 'year';

export const GRANULARITIES: readonly Granularity[] = ['day', 'week', 'month', 'year'];

export const GRANULARITY_LABEL: Readonly<Record<Granularity, string>> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
};

export interface Period {
  readonly key: string;
  /** Etiqueta de eje («9 sep», «S37», «Sep», «2026»). */
  readonly label: string;
  /** Etiqueta larga para tooltips («Septiembre 2026», «Semana 37 · 7–13 sep 2026»). */
  readonly longLabel: string;
  readonly from: IsoDate;
  readonly to: IsoDate;
}

export function periodKeyOf(date: IsoDate, g: Granularity): string {
  switch (g) {
    case 'day':
      return date;
    case 'week':
      return isoWeekKey(date);
    case 'month':
      return monthKey(date);
    case 'year':
      return String(year(date));
  }
}

function periodStart(date: IsoDate, g: Granularity): IsoDate {
  switch (g) {
    case 'day':
      return date;
    case 'week':
      return startOfIsoWeek(date);
    case 'month':
      return startOfMonth(date);
    case 'year':
      return startOfYear(date);
  }
}

function periodEnd(start: IsoDate, g: Granularity): IsoDate {
  switch (g) {
    case 'day':
      return start;
    case 'week':
      return endOfIsoWeek(start);
    case 'month':
      return endOfMonth(start);
    case 'year':
      return endOfYear(start);
  }
}

/** Desplaza el inicio de un periodo `n` periodos (negativo = hacia atrás). */
export function shiftPeriod(start: IsoDate, n: number, g: Granularity): IsoDate {
  switch (g) {
    case 'day':
      return addDays(start, n);
    case 'week':
      return addWeeks(start, n);
    case 'month':
      return addMonthsClamped(start, n, 1);
    case 'year':
      return addYearsClamped(start, n, 1);
  }
}

function labelsFor(start: IsoDate, g: Granularity): { readonly label: string; readonly longLabel: string } {
  switch (g) {
    case 'day':
      return { label: formatDayMonth(start), longLabel: formatDayMonthYear(start) };
    case 'week':
      return { label: `S${isoWeek(start).week}`, longLabel: formatWeekLabel(start) };
    case 'month':
      return { label: formatMonthAxis(start), longLabel: formatMonthYear(start) };
    case 'year':
      return { label: String(year(start)), longLabel: String(year(start)) };
  }
}

/** Periodos que cubren el rango (recortados a él), incluidos los vacíos, en orden. */
export function periodsBetween(range: DateRange, g: Granularity): Period[] {
  const out: Period[] = [];
  let start = periodStart(range.from, g);
  let guard = 0;
  while (start <= range.to && guard++ < 20_000) {
    const end = periodEnd(start, g);
    out.push({
      key: periodKeyOf(start, g),
      ...labelsFor(start, g),
      from: maxIso(start, range.from),
      to: minIso(end, range.to),
    });
    start = shiftPeriod(start, 1, g);
  }
  return out;
}

/** El rango de la misma longitud inmediatamente anterior (comparativa «periodo actual vs anterior»). */
export function previousRange(range: DateRange): DateRange {
  const length = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

/** Primer día del periodo que está `n` periodos antes del que contiene `range.from`. */
export function historyStart(range: DateRange, g: Granularity, n: number): IsoDate {
  return shiftPeriod(periodStart(range.from, g), -n, g);
}
