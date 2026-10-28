import { SYSTEM_CATEGORY } from '../../core/types/category';
import {
  type DateRange,
  type IsoDate,
  addDays,
  addMonthsClamped,
  daysInMonth,
  endOfMonth,
  isoDate,
  month,
  startOfMonth,
  year,
} from '../../core/types/iso-date';

/**
 * «Mes financiero»: el periodo que el usuario considera su mes.
 *
 * - `calendar`: del día 1 al último (lo de siempre).
 * - `payday`: empieza en un día de referencia (p. ej. el 28) y, si hay una
 *   nómina hasta `PAYDAY_WINDOW_DAYS` días antes o después, empieza el día
 *   en que entró. Así la nómina del 26 de octubre abre el mes de noviembre,
 *   y un mes sin nómina (o futuro) sigue existiendo con el día de referencia.
 *
 * Cada periodo se nombra con el mes natural en que cae la mayor parte: con
 * día de referencia ≥ 16 empieza en el mes anterior (28 oct – 27 nov =
 * «Noviembre»); con ≤ 15, en el propio mes (5 nov – 4 dic = «Noviembre»).
 */
export type MonthMode = 'calendar' | 'payday';

export interface MonthConfig {
  readonly mode: MonthMode;
  /** Día de referencia de 1 a 28 (solo `payday`). */
  readonly startDay: number;
}

export const CALENDAR_MONTH: MonthConfig = { mode: 'calendar', startDay: 1 };

/** Una nómina a esta distancia del día de referencia, o menos, mueve el inicio del mes. */
export const PAYDAY_WINDOW_DAYS = 7;

export function clampStartDay(day: number): number {
  return Number.isFinite(day) ? Math.min(28, Math.max(1, Math.round(day))) : 1;
}

/** ¿Este ingreso es una nómina? Por la categoría de sistema o porque el concepto lo dice. */
export function isPayroll(income: { readonly concept: string; readonly categoryId: string | null }): boolean {
  if (income.categoryId === SYSTEM_CATEGORY.nomina) return true;
  const plain = income.concept.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return /\bnomina\b/.test(plain);
}

/**
 * Calcula los meses financieros. `paydays` son las fechas de las nóminas
 * (en cualquier orden, con repetidos); solo se usan en modo `payday`.
 */
export class FinancialCalendar {
  private readonly paydays: readonly IsoDate[];
  private readonly config: MonthConfig;
  private readonly cache = new Map<string, IsoDate>();

  constructor(config: MonthConfig = CALENDAR_MONTH, paydays: Iterable<IsoDate> = []) {
    this.config = config.mode === 'payday' ? { mode: 'payday', startDay: clampStartDay(config.startDay) } : CALENDAR_MONTH;
    this.paydays = [...new Set(paydays)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  get isCalendar(): boolean {
    return this.config.mode === 'calendar' || this.config.startDay === 1;
  }

  /** Día de referencia de inicio del mes `label` (sin mirar nóminas). */
  nominalStart(label: IsoDate): IsoDate {
    const first = startOfMonth(label);
    if (this.isCalendar) return first;
    const d = this.config.startDay;
    const base = d >= 16 ? addMonthsClamped(first, -1, 1) : first;
    return isoDate(year(base), month(base), Math.min(d, daysInMonth(year(base), month(base))));
  }

  /** Primer día del mes financiero `label` (cualquier día del mes natural que le da nombre). */
  startOf(label: IsoDate): IsoDate {
    const key = startOfMonth(label);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const nominal = this.nominalStart(key);
    let start = nominal;
    if (!this.isCalendar) {
      const from = addDays(nominal, -PAYDAY_WINDOW_DAYS);
      const to = addDays(nominal, PAYDAY_WINDOW_DAYS);
      const hit = this.paydays.find((p) => p >= from && p <= to);
      if (hit) start = hit;
    }
    this.cache.set(key, start);
    return start;
  }

  rangeOf(label: IsoDate): DateRange {
    const from = this.startOf(label);
    const next = this.startOf(addMonthsClamped(startOfMonth(label), 1, 1));
    return { from, to: addDays(next, -1) };
  }

  /** Mes financiero (como día 1 del mes que le da nombre) al que pertenece `date`. */
  labelOf(date: IsoDate): IsoDate {
    if (this.isCalendar) return startOfMonth(date);
    const here = startOfMonth(date);
    for (const candidate of [addMonthsClamped(here, 1, 1), here, addMonthsClamped(here, -1, 1)]) {
      const r = this.rangeOf(candidate);
      if (date >= r.from && date <= r.to) return candidate;
    }
    return here;
  }

  /** Los `n` meses financieros que terminan en `label`, en orden cronológico. */
  lastLabels(label: IsoDate, n: number): readonly IsoDate[] {
    const start = startOfMonth(label);
    return Array.from({ length: n }, (_, i) => addMonthsClamped(start, i - (n - 1), 1));
  }

  /** ¿El mes financiero coincide con el natural? (para no repetir «1 – 30 nov» en la cabecera). */
  isNaturalMonth(label: IsoDate): boolean {
    const r = this.rangeOf(label);
    return r.from === startOfMonth(label) && r.to === endOfMonth(label);
  }
}
