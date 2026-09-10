import { type Money, money } from '../../core/types/money';

/**
 * Calculadora financiera: los tres modos del handoff. Todo en céntimos
 * enteros; los porcentajes viajan en puntos básicos (6,8 % = 680) para no
 * arrastrar float en las entradas.
 */

export type FinancialMode = 'percent' | 'split' | 'compound';

export const FINANCIAL_MODE_LABEL: Readonly<Record<FinancialMode, string>> = {
  percent: '% de importe',
  split: 'Dividir',
  compound: 'Interés compuesto',
};

/** «21 % de 2.412,68 €» = 506,66 € (redondeo al céntimo). */
export function percentOf(amount: Money, percentBp: number): Money {
  return money(Math.round((amount * percentBp) / 10000));
}

export interface SplitResult {
  /** Lo que paga cada persona (redondeado hacia abajo al céntimo). */
  readonly each: Money;
  /** Céntimos sobrantes que alguien tiene que asumir. */
  readonly remainder: Money;
  /** Reparto exacto: los primeros pagan un céntimo más. */
  readonly shares: readonly Money[];
}

/** Divide un gasto entre N personas sin perder ni un céntimo. */
export function splitBetween(amount: Money, people: number): SplitResult {
  if (!Number.isInteger(people) || people <= 0) {
    return { each: money(0), remainder: money(0), shares: [] };
  }
  const base = Math.trunc(amount / people);
  const remainder = amount - base * people;
  const shares = Array.from({ length: people }, (_, i) => money(base + (i < remainder ? 1 : 0)));
  return { each: money(base), remainder: money(remainder), shares };
}

export interface CompoundInput {
  readonly principal: Money;
  readonly monthlyContribution: Money;
  readonly years: number;
  /** Rentabilidad anual en puntos básicos (6,8 % = 680). */
  readonly annualRateBp: number;
}

export interface CompoundResult {
  readonly finalValue: Money;
  readonly contributed: Money;
  readonly interest: Money;
}

/**
 * Interés compuesto con aportación periódica mensual, capitalización mensual
 * y aportación al final de cada mes (convención habitual en simuladores
 * españoles). El saldo se mantiene en céntimos y se redondea cada mes.
 */
export function compoundInterest(input: CompoundInput): CompoundResult {
  const months = Math.max(0, Math.round(input.years * 12));
  const monthlyRate = input.annualRateBp / 10000 / 12;
  let balance = input.principal as number;
  for (let i = 0; i < months; i++) {
    balance = Math.round(balance * (1 + monthlyRate)) + input.monthlyContribution;
  }
  const contributed = money(input.principal + input.monthlyContribution * months);
  const finalValue = money(Math.round(balance));
  return { finalValue, contributed, interest: money(finalValue - contributed) };
}
