import { type DateRange, type IsoDate, addDays, addMonthsClamped, addYearsClamped, startOfMonth, startOfYear } from '../../core/types/iso-date';
import { type Money, money } from '../../core/types/money';
import { type Period, periodsBetween } from './periods';

/** Granularidades de los gráficos de evolución (Ahorros, Inversiones). */
export type EvolutionGranularity = 'day' | 'month' | 'year';

export const EVOLUTION_GRANULARITY_LABEL: Readonly<Record<EvolutionGranularity, string>> = {
  day: 'Días',
  month: 'Meses',
  year: 'Años',
};

/**
 * Cuántos periodos se ven de entrada (el resto, con scroll lateral):
 * 10 días; los 3 meses anteriores y el actual; los últimos 5 años.
 */
export const EVOLUTION_WINDOW: Readonly<Record<EvolutionGranularity, number>> = {
  day: 10,
  month: 4,
  year: 5,
};

/** Puntos de un gráfico de evolución: el valor al cierre de cada periodo. */
export interface EvolutionPoint {
  readonly period: Period;
  readonly value: Money;
  /** Segunda serie opcional (lo aportado, en Inversiones). */
  readonly secondary: Money | null;
}

/**
 * Periodos a dibujar: desde el primer dato (o, si hay pocos, lo justo para
 * llenar la ventana inicial) hasta hoy.
 */
export function evolutionRange(firstDate: IsoDate | null, today: IsoDate, g: EvolutionGranularity): DateRange {
  const window = EVOLUTION_WINDOW[g];
  const minFrom =
    g === 'day'
      ? addDays(today, -(window - 1))
      : g === 'month'
        ? addMonthsClamped(startOfMonth(today), -(window - 1), 1)
        : addYearsClamped(startOfYear(today), -(window - 1), 1);
  const from = firstDate && firstDate < minFrom ? firstDate : minFrom;
  return { from, to: today };
}

/**
 * Valor de cada periodo arrastrando el último conocido de cada serie
 * (valoraciones de inversiones: si no actualizas una en un mes, cuenta su
 * último valor). `points` ordenados o no; se agrupan por `key`.
 */
export function carryForwardSeries(
  points: readonly { readonly key: string; readonly date: IsoDate; readonly value: number; readonly secondary?: number }[],
  range: DateRange,
  g: EvolutionGranularity,
): readonly EvolutionPoint[] {
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const last = new Map<string, { value: number; secondary: number }>();
  const hasSecondary = sorted.some((p) => p.secondary !== undefined);
  let i = 0;
  return periodsBetween(range, g).map((period) => {
    while (i < sorted.length && (sorted[i] as (typeof sorted)[number]).date <= period.to) {
      const p = sorted[i] as (typeof sorted)[number];
      last.set(p.key, { value: p.value, secondary: p.secondary ?? 0 });
      i++;
    }
    let value = 0;
    let secondary = 0;
    for (const v of last.values()) {
      value += v.value;
      secondary += v.secondary;
    }
    return { period, value: money(value), secondary: hasSecondary ? money(secondary) : null };
  });
}

/** Saldo acumulado al cierre de cada periodo a partir de flujos con signo (huchas de ahorro). */
export function cumulativeSeries(
  flows: readonly { readonly date: IsoDate; readonly amount: number }[],
  range: DateRange,
  g: EvolutionGranularity,
): readonly EvolutionPoint[] {
  const sorted = [...flows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let total = 0;
  let i = 0;
  return periodsBetween(range, g).map((period) => {
    while (i < sorted.length && (sorted[i] as (typeof sorted)[number]).date <= period.to) {
      total += (sorted[i] as (typeof sorted)[number]).amount;
      i++;
    }
    return { period, value: money(total), secondary: null };
  });
}
