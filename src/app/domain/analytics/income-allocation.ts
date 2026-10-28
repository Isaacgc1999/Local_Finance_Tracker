import { type Money, money, ratioBasisPoints } from '../../core/types/money';
import type { TypeTotals } from './aggregation';
import type { ExpenseKindTotals } from './expense-kind';

export type AllocationKey = 'fixed' | 'variable' | 'leisure' | 'subscriptions' | 'saving' | 'investment' | 'free';

export const ALLOCATION_LABEL: Readonly<Record<AllocationKey, string>> = {
  fixed: 'Fijos',
  variable: 'Variables',
  leisure: 'Ocio',
  subscriptions: 'Suscripciones',
  saving: 'Ahorro',
  investment: 'Inversión',
  free: 'Libre',
};

export interface AllocationSlice {
  readonly key: AllocationKey;
  readonly amount: Money;
  /** Parte de los ingresos del mes, en puntos básicos; `null` sin ingresos. */
  readonly shareBp: number | null;
}

export interface IncomeAllocation {
  readonly income: Money;
  readonly slices: readonly AllocationSlice[];
  /** Ahorro + inversión sobre ingresos, en puntos básicos. */
  readonly savingsRateBp: number | null;
  /** Lo que salió por encima de lo que entró (0 si cuadra). */
  readonly shortfall: Money;
}

/**
 * «¿A dónde va tu nómina?»: los ingresos del mes repartidos entre tipos de
 * gasto, ahorro, inversión y lo que queda sin asignar. Si salió más de lo
 * que entró, no hay «sin asignar» y `shortfall` dice cuánto falta.
 */
export function incomeAllocation(totals: TypeTotals, kinds: ExpenseKindTotals): IncomeAllocation {
  const income = totals.income;
  const parts: [AllocationKey, Money][] = [
    ['fixed', kinds.fixed],
    ['variable', kinds.variable],
    ['leisure', kinds.leisure],
    ['subscriptions', kinds.subscriptions],
    ['saving', totals.saving],
    ['investment', totals.investment],
  ];
  const used = parts.reduce((s, [, m]) => s + m, 0);
  const free = money(Math.max(0, income - used));
  const slices = [...parts, ['free', free] as [AllocationKey, Money]]
    .filter(([, m]) => m > 0)
    .map(([key, amount]) => ({ key, amount, shareBp: ratioBasisPoints(amount, income) }));
  return {
    income,
    slices,
    savingsRateBp: ratioBasisPoints(money(totals.saving + totals.investment), income),
    shortfall: money(Math.max(0, used - income)),
  };
}
