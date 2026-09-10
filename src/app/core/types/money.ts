import { validationError } from '../errors/app-error';
import { type Result, err, ok } from './result';

/**
 * Dinero en céntimos, entero, con signo. Nunca float.
 * El tipo es de marca: solo se construye con `money()` o las operaciones de aquí.
 */
export type Money = number & { readonly __brand: 'Money' };

export const ZERO: Money = 0 as Money;

/** Construye un importe. Lanza solo ante un error de programación (no entero). */
export function money(cents: number): Money {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`Money debe ser un entero seguro en céntimos, recibido ${cents}`);
  }
  return cents as Money;
}

/** Versión segura para datos externos (BD, JSON, formularios). */
export function tryMoney(value: unknown, field = 'amount'): Result<Money> {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return err(validationError(field, 'El importe tiene que ser un entero en céntimos.'));
  }
  return ok(value as Money);
}

export function isMoney(value: unknown): value is Money {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function addMoney(a: Money, b: Money): Money {
  return money(a + b);
}

export function subMoney(a: Money, b: Money): Money {
  return money(a - b);
}

export function negate(a: Money): Money {
  return money(-a);
}

export function absMoney(a: Money): Money {
  return money(Math.abs(a));
}

/** Redondeo «half away from zero» al céntimo (el habitual en banca española). */
function roundHalfAwayFromZero(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(value) + 0.5);
}

/** Multiplica por un factor decimal (p. ej. 0.21) redondeando al céntimo. */
export function mulMoney(a: Money, factor: number): Money {
  if (!Number.isFinite(factor)) throw new TypeError('Factor no finito');
  return money(roundHalfAwayFromZero(a * factor));
}

/** Divide entre un número (personas, días…) redondeando al céntimo. Lanza si divisor = 0. */
export function divMoney(a: Money, divisor: number): Money {
  if (!Number.isFinite(divisor) || divisor === 0) throw new TypeError('Divisor inválido');
  return money(roundHalfAwayFromZero(a / divisor));
}

/** División segura: `null` cuando el divisor es 0 (mes sin días, sin movimientos…). */
export function divMoneyOrNull(a: Money, divisor: number): Money | null {
  return divisor === 0 || !Number.isFinite(divisor) ? null : divMoney(a, divisor);
}

/** Porcentaje entero de un importe en ‰ (p. ej. 21 % = 210 ‰), sin pasar por float intermedio. */
export function permilleOf(a: Money, permille: number): Money {
  if (!Number.isSafeInteger(permille)) throw new TypeError('Permille debe ser entero');
  return money(roundHalfAwayFromZero((a * permille) / 1000));
}

export function sumMoney(values: Iterable<Money>): Money {
  let total = 0;
  for (const v of values) total += v;
  return money(total);
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxMoney(a: Money, b: Money): Money {
  return a >= b ? a : b;
}

export function minMoney(a: Money, b: Money): Money {
  return a <= b ? a : b;
}

/**
 * Proporción `num / den` en tanto por mil, entero redondeado.
 * `null` cuando el denominador es 0: la UI muestra un guion, nunca NaN.
 */
export function ratioPermille(num: Money, den: Money): number | null {
  if (den === 0) return null;
  return Math.round((num * 1000) / den);
}

/**
 * Proporción con precisión de centésima de punto (‰ × 10 = «por diezmil»),
 * para mostrar porcentajes con un decimal («68,5 %») sin perder precisión.
 */
export function ratioBasisPoints(num: Money, den: Money): number | null {
  if (den === 0) return null;
  return Math.round((num * 10000) / den);
}

/** Céntimos → euros como número solo para la frontera de exportación (Excel). */
export function toEurosForExport(a: Money): number {
  return a / 100;
}
