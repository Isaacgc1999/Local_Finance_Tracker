import { signal } from '@angular/core';

import { validationError } from '../errors/app-error';
import { type Money, money } from '../types/money';
import { type Result, err, ok } from '../types/result';

/**
 * Moneda de visualización. No hay conversión: los importes se guardan en
 * céntimos y solo cambia el símbolo. El formato numérico sigue siendo es-ES.
 */
export type Currency = 'EUR' | 'USD';

export interface CurrencyInfo {
  readonly symbol: string;
  readonly name: string;
  /** Plural en minúscula para frases («escribe los importes en euros»). */
  readonly plural: string;
  /** Texto del selector de Ajustes. */
  readonly label: string;
}

export const CURRENCIES: Readonly<Record<Currency, CurrencyInfo>> = {
  EUR: { symbol: '€', name: 'Euro', plural: 'euros', label: 'Euro · 1.234,56 €' },
  USD: { symbol: '$', name: 'Dólar estadounidense', plural: 'dólares', label: 'Dólar estadounidense · 1.234,56 $' },
};

/**
 * La moneda activa es una signal a propósito: `formatMoney` la lee, así que
 * cualquier `computed` o plantilla que formatee dinero pasa a depender de
 * ella y se repinta solo cuando se cambia en Ajustes, sin recargar nada.
 */
const currencySig = signal<Currency>('EUR');

export const activeCurrency = currencySig.asReadonly();

export function setCurrency(currency: Currency): void {
  currencySig.set(currency);
}

export function currencySymbol(): string {
  return CURRENCIES[currencySig()].symbol;
}

export function currencyPlural(): string {
  return CURRENCIES[currencySig()].plural;
}

/**
 * Formato es-ES según el handoff: punto de millar SIEMPRE (también en 4
 * dígitos: «1.884,37 €»), coma decimal, espacio fino antes del símbolo.
 * No se usa Intl porque la regla CLDR de es-ES omite el punto de millar
 * en cifras de cuatro dígitos («1884,37 €»), que no es lo que dibuja el diseño.
 */

/** Signo menos tipográfico (U+2212), el que usa el handoff («−72,41 €»). */
export const MINUS = '−';

/**
 * Espacio duro entre la cifra y el símbolo (norma tipográfica española):
 * impide que «1.234,56» y «€» queden en líneas distintas.
 */
export const NBSP = ' ';

export interface MoneyFormatOptions {
  /** `auto` = solo negativos; `always` = «+» y «−»; `never` = sin signo. */
  readonly sign?: 'auto' | 'always' | 'never';
  /** Añadir « €». Por defecto sí. */
  readonly symbol?: boolean;
}

function groupThousands(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i;
    out += digits[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += '.';
  }
  return out;
}

/** Solo la cifra: «1.234,56». */
export function formatAmount(amount: Money, sign: MoneyFormatOptions['sign'] = 'auto'): string {
  const abs = Math.abs(amount);
  const integer = Math.floor(abs / 100);
  const cents = abs % 100;
  const body = `${groupThousands(String(integer))},${String(cents).padStart(2, '0')}`;
  if (sign === 'never') return body;
  if (amount < 0) return `${MINUS}${body}`;
  if (sign === 'always' && amount > 0) return `+${body}`;
  return body;
}

/** «1.234,56 €», «−72,41 €», «+2.412,68 €». */
export function formatMoney(amount: Money, options: MoneyFormatOptions = {}): string {
  const body = formatAmount(amount, options.sign ?? 'auto');
  return options.symbol === false ? body : `${body}${NBSP}${currencySymbol()}`;
}

const CLEAN = /[\s  €$+]/g;

/**
 * Parsea texto humano a céntimos. Acepta «1.234,56», «1234,56», «1234.56»,
 * «12», «−12,5», «1,234.56». Regla de ambigüedad: si hay punto y coma, el
 * último separador es el decimal; solo coma = decimal; solo punto = decimal
 * salvo que le sigan exactamente tres dígitos (millar es-ES).
 */
export function parseMoney(input: string, field = 'amount'): Result<Money> {
  const invalid = () => err(validationError(field, 'Importe no válido.'));
  let text = input.replace(CLEAN, '').replace(MINUS, '-');
  if (text === '' || text === '-') return invalid();

  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }
  if (!/^[0-9.,]+$/.test(text)) return invalid();

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let integerPart: string;
  let decimalPart = '';

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = Math.max(lastComma, lastDot);
    integerPart = text.slice(0, decimalSep);
    decimalPart = text.slice(decimalSep + 1);
  } else if (lastComma >= 0) {
    if (text.indexOf(',') !== lastComma) return invalid();
    integerPart = text.slice(0, lastComma);
    decimalPart = text.slice(lastComma + 1);
  } else if (lastDot >= 0) {
    const after = text.slice(lastDot + 1);
    const onlyOneDot = text.indexOf('.') === lastDot;
    if (onlyOneDot && after.length !== 3) {
      integerPart = text.slice(0, lastDot);
      decimalPart = after;
    } else {
      integerPart = text; // «1.234» o «1.234.567» = millares
    }
  } else {
    integerPart = text;
  }

  integerPart = integerPart.replace(/[.,]/g, '');
  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(decimalPart)) return invalid();
  if (decimalPart.length > 2) return err(validationError(field, 'Máximo dos decimales.'));
  if (integerPart === '' && decimalPart === '') return invalid();

  const cents = Number(integerPart || '0') * 100 + Number(decimalPart.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) return err(validationError(field, 'Importe demasiado grande.'));
  return ok(money(negative ? -cents : cents));
}
