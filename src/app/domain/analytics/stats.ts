/**
 * Estadística sobre enteros (céntimos). Los resultados intermedios pueden
 * ser fraccionarios; se redondean al entero al devolverse y solo se
 * convierten a porcentaje al final, en la capa de presentación.
 */

/** Mediana de una lista de enteros; `null` si está vacía. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1] ?? 0;
  const b = sorted[mid] ?? 0;
  return Math.round((a + b) / 2);
}

/** Media redondeada al entero; `null` si está vacía. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return Math.round(sum / values.length);
}

/** Varianza poblacional (céntimos²) y desviación típica (céntimos). `null` si no hay valores. */
export function varianceAndStdDev(values: readonly number[]): { readonly variance: number; readonly stdDev: number } | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  const avg = sum / values.length;
  let acc = 0;
  for (const v of values) acc += (v - avg) * (v - avg);
  const variance = acc / values.length;
  return { variance: Math.round(variance), stdDev: Math.round(Math.sqrt(variance)) };
}

/**
 * Media móvil simple de ventana `window`: `null` hasta completar la ventana.
 * O(n) con suma deslizante.
 */
export function movingAverage(values: readonly number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(values.length).fill(null);
  if (window <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= window) sum -= values[i - window] ?? 0;
    if (i >= window - 1) out[i] = Math.round(sum / window);
  }
  return out;
}
