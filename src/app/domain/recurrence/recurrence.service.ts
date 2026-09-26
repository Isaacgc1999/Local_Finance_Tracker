import type { EventDraft } from '../../core/types/event';
import {
  type IsoDate,
  addMonthsClamped,
  addWeeks,
  addYearsClamped,
  addDays,
  day,
  daysBetween,
  maxIso,
  minIso,
  month,
  weekdayIso,
  year,
} from '../../core/types/iso-date';
import type { Recurrence, VirtualEvent } from '../../core/types/recurrence';

/**
 * Motor de recurrencias: proyecta ocurrencias bajo demanda. Puro, sin
 * dependencias de Angular ni de la base de datos.
 *
 * Políticas:
 * - Mensual/anual con día 31 (o 29/30) en meses más cortos → último día del mes.
 * - Semanal: el día de la semana de la regla (o el de la fecha de inicio).
 * - `end_date` inclusivo; una regla desactivada no proyecta nada.
 * - Una ocurrencia ya materializada (fila real en `events`) manda siempre:
 *   el motor nunca la regenera ni la sobrescribe.
 */

const MAX_ITERATIONS = 20_000;

/** k-ésima ocurrencia (k ≥ 0) de la regla, monótona creciente en k. */
export function occurrenceAt(rule: Recurrence, k: number): IsoDate {
  const interval = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case 'weekly': {
      const target = rule.weekday ?? weekdayIso(rule.startDate);
      const shift = (target - weekdayIso(rule.startDate) + 7) % 7;
      const base = addDays(rule.startDate, shift);
      return addWeeks(base, k * interval);
    }
    case 'monthly': {
      const dom = rule.dayOfMonth ?? day(rule.startDate);
      const inStartMonth = addMonthsClamped(rule.startDate, 0, dom);
      const first = inStartMonth >= rule.startDate ? 0 : 1;
      return addMonthsClamped(rule.startDate, first + k * interval, dom);
    }
    case 'yearly': {
      const dom = rule.dayOfMonth ?? day(rule.startDate);
      const inStartYear = addYearsClamped(rule.startDate, 0, dom);
      const first = inStartYear >= rule.startDate ? 0 : 1;
      return addYearsClamped(rule.startDate, first + k * interval, dom);
    }
  }
}

/** Índice desde el que empezar a iterar para alcanzar `from` sin recorrer todo el pasado. */
function startIndex(rule: Recurrence, from: IsoDate): number {
  if (from <= rule.startDate) return 0;
  const interval = Math.max(1, rule.interval);
  let units: number;
  switch (rule.frequency) {
    case 'weekly':
      units = Math.floor(daysBetween(rule.startDate, from) / 7);
      break;
    case 'monthly':
      units = (year(from) - year(rule.startDate)) * 12 + (month(from) - month(rule.startDate));
      break;
    case 'yearly':
      units = year(from) - year(rule.startDate);
      break;
  }
  return Math.max(0, Math.floor(units / interval) - 2);
}

function toVirtual(rule: Recurrence, date: IsoDate, materialized = false): VirtualEvent {
  return {
    recurrenceId: rule.id,
    date,
    type: rule.type,
    amountCents: rule.amountCents,
    concept: rule.concept,
    categoryId: rule.categoryId,
    materialized,
  };
}

/** Fechas de la regla dentro de `[from, to]` (ambos inclusivos), en orden. */
export function occurrencesBetween(rule: Recurrence, from: IsoDate, to: IsoDate): IsoDate[] {
  if (!rule.active) return [];
  const upper = rule.endDate ? minIso(to, rule.endDate) : to;
  const lower = maxIso(from, rule.startDate);
  if (lower > upper) return [];
  const dates: IsoDate[] = [];
  for (let k = startIndex(rule, lower), i = 0; i < MAX_ITERATIONS; k++, i++) {
    const date = occurrenceAt(rule, k);
    if (date > upper) break;
    if (date >= lower) dates.push(date);
  }
  return dates;
}

/** Proyección de la regla en un rango. No persiste nada. */
export function expand(rule: Recurrence, from: IsoDate, to: IsoDate): VirtualEvent[] {
  return occurrencesBetween(rule, from, to).map((date) => toVirtual(rule, date));
}

/** Primera ocurrencia estrictamente posterior a `after`, o `null` si la regla ya no genera más. */
export function nextOccurrence(rule: Recurrence, after: IsoDate): IsoDate | null {
  if (!rule.active) return null;
  for (let k = startIndex(rule, after), i = 0; i < MAX_ITERATIONS; k++, i++) {
    const date = occurrenceAt(rule, k);
    if (rule.endDate && date > rule.endDate) return null;
    if (date > after) return date;
  }
  return null;
}

/** Marca como materializadas las ocurrencias que ya existen como fila real. La edición manual gana. */
export function mergeWithMaterialized(
  virtual: readonly VirtualEvent[],
  realDates: ReadonlySet<IsoDate>,
): VirtualEvent[] {
  return virtual.map((v) => (realDates.has(v.date) ? { ...v, materialized: true } : v));
}

/** Borrador de la fila real que representa una ocurrencia de la regla. */
export function instanceDraft(rule: Recurrence, date: IsoDate): EventDraft & { readonly recurrenceId: string } {
  return {
    type: rule.type,
    amountCents: rule.amountCents,
    date,
    concept: rule.concept,
    categoryId: rule.categoryId,
    // Un gasto que se repite es, por definición, un gasto fijo.
    nature: rule.type === 'expense' ? 'fixed' : null,
    paymentMethod: rule.paymentMethod,
    notes: null,
    attachmentPath: null,
    recurrenceId: rule.id,
    accountId: rule.accountId,
    meta: rule.meta,
  };
}

/**
 * Ocurrencias vencidas (≤ `upTo`) que todavía no son filas reales. Es lo que
 * se materializa al arrancar la app y al cambiar el día.
 */
export function dueInstances(
  rule: Recurrence,
  upTo: IsoDate,
  alreadyMaterialized: ReadonlySet<IsoDate>,
): (EventDraft & { readonly recurrenceId: string })[] {
  return occurrencesBetween(rule, rule.startDate, upTo)
    .filter((date) => !alreadyMaterialized.has(date))
    .map((date) => instanceDraft(rule, date));
}
