import { LEISURE_CATEGORY_IDS } from './category';
import type { Money } from './money';

/**
 * Qué parte del dinero del mes vigila un presupuesto. Los siete ámbitos base
 * reutilizan las agrupaciones que ya pinta la app (tipos de gasto del donut,
 * tipos de movimiento); además se puede presupuestar una categoría concreta.
 */
export const BASE_BUDGET_SCOPES = [
  'total',
  'fixed',
  'variable',
  'leisure',
  'subscriptions',
  'saving',
  'investment',
] as const;

export type BaseBudgetScope = (typeof BASE_BUDGET_SCOPES)[number];
export type BudgetScope = BaseBudgetScope | `category:${string}`;

export const BUDGET_SCOPE_LABEL: Readonly<Record<BaseBudgetScope, string>> = {
  total: 'Gasto total',
  fixed: 'Gastos fijos',
  variable: 'Gastos variables',
  leisure: 'Ocio',
  subscriptions: 'Suscripciones',
  saving: 'Ahorro',
  investment: 'Inversión',
};

/** Pista breve de qué suma cada ámbito, para el selector de Ajustes. */
export const BUDGET_SCOPE_HINT: Readonly<Record<BaseBudgetScope, string>> = {
  total: 'Todo lo que sale: gastos, suscripciones y domiciliaciones',
  fixed: 'Gastos de naturaleza fija y domiciliaciones',
  variable: 'El resto de gastos',
  leisure: 'Categorías Ocio y Viajes',
  subscriptions: 'Movimientos de tipo suscripción',
  saving: 'Traspasos a ahorro',
  investment: 'Aportaciones a inversión',
};

/**
 * `limit`: un techo que no conviene pasar (gastos).
 * `goal`: una cifra a la que se quiere llegar (ahorro e inversión).
 */
export type BudgetKind = 'limit' | 'goal';

export function budgetKindOf(scope: BudgetScope): BudgetKind {
  return scope === 'saving' || scope === 'investment' ? 'goal' : 'limit';
}

export function categoryScope(categoryId: string): BudgetScope {
  return `category:${categoryId}`;
}

export function categoryIdOf(scope: BudgetScope): string | null {
  return scope.startsWith('category:') ? scope.slice('category:'.length) : null;
}

export function isBudgetScope(value: unknown): value is BudgetScope {
  if (typeof value !== 'string') return false;
  if ((BASE_BUDGET_SCOPES as readonly string[]).includes(value)) return true;
  return /^category:[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Las categorías de ocio ya están cubiertas por el ámbito «Ocio»: ofrecerlas
 * también por separado duplicaría la opción en el selector.
 */
export function isCategoryBudgetable(categoryId: string): boolean {
  return !LEISURE_CATEGORY_IDS.includes(categoryId);
}

export interface Budget {
  readonly id: string;
  readonly scope: BudgetScope;
  /** Importe mensual. */
  readonly amountCents: Money;
  readonly createdAt: string;
  readonly updatedAt: string;
}
