import type { Granularity } from '../../domain/analytics/periods';

/**
 * Periodos a la vista en los gráficos de Analítica. Si el rango tiene más, el
 * gráfico se ensancha dentro de un contenedor con scroll horizontal y arranca
 * mostrando los más recientes (ADR-079).
 */
export const VISIBLE_PERIODS: Readonly<Record<Granularity, number>> = { day: 7, week: 6, month: 6, year: 5 };

/**
 * Ancho del gráfico como % del contenedor con scroll, o `null` si todo cabe.
 * Las barras ocupan una franja por periodo (`count / visible`); una línea de
 * borde a borde reparte `count − 1` tramos (`(count − 1) / (visible − 1)`).
 */
export function chartWidthPercent(count: number, visible: number, edgeToEdge = false): number | null {
  if (count <= visible) return null;
  return edgeToEdge ? (100 * (count - 1)) / (visible - 1) : (100 * count) / visible;
}
