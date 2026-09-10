import { MINUS } from './money-format';

/**
 * Los porcentajes viajan como «puntos básicos» (centésimas de punto: 6846 = 68,46 %)
 * calculados en entero al final. Solo aquí se redondean para mostrar.
 */

export const DASH = '—';

export interface PercentFormatOptions {
  readonly decimals?: 0 | 1 | 2;
  readonly sign?: 'auto' | 'always' | 'never';
}

function fixed(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** 6846 → «68,5 %»; null → «—». */
export function formatBasisPoints(bp: number | null, options: PercentFormatOptions = {}): string {
  if (bp === null) return DASH;
  const decimals = options.decimals ?? 1;
  const sign = options.sign ?? 'auto';
  const abs = Math.abs(bp) / 100;
  const body = `${fixed(abs, decimals)} %`;
  if (sign === 'never' || bp === 0) return body;
  if (bp < 0) return `${MINUS}${body}`;
  return sign === 'always' ? `+${body}` : body;
}

export type Tone = 'income' | 'expense' | 'neutral';

export interface DeltaDisplay {
  readonly text: string;
  readonly tone: Tone;
}

/**
 * Delta con flecha y color codificando el signo (handoff, fila de métricas):
 * ▼ + verde cuando bajar es bueno (gasto), ▲ + rojo en caso contrario.
 * `goodWhenNegative = false` invierte la lectura (ingresos, saldo).
 */
export function formatDelta(
  bp: number | null,
  options: { readonly goodWhenNegative?: boolean; readonly decimals?: 0 | 1 } = {},
): DeltaDisplay {
  if (bp === null) return { text: DASH, tone: 'neutral' };
  if (bp === 0) return { text: `0,0 %`, tone: 'neutral' };
  const goodWhenNegative = options.goodWhenNegative ?? true;
  const arrow = bp < 0 ? '▼' : '▲';
  const good = bp < 0 ? goodWhenNegative : !goodWhenNegative;
  const body = fixed(Math.abs(bp) / 100, options.decimals ?? 1);
  return { text: `${arrow} ${body} %`, tone: good ? 'income' : 'expense' };
}

/** Puntos porcentuales: 385 (centésimas) → «38,5 puntos». */
export function formatPoints(bp: number): string {
  return `${fixed(Math.abs(bp) / 100, 1)} puntos`;
}

/** Entero con punto de millar: 1847 → «1.847». */
export function formatInteger(n: number): string {
  const s = String(Math.trunc(Math.abs(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    out += s[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += '.';
  }
  return n < 0 ? `${MINUS}${out}` : out;
}
