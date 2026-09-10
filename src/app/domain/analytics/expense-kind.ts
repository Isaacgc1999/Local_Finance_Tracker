import { LEISURE_CATEGORY_IDS } from '../../core/types/category';
import type { Event } from '../../core/types/event';
import { type Money, ZERO, money } from '../../core/types/money';

/**
 * Los cuatro «tipos de gasto» del donut y del gráfico semanal del handoff
 * (fijo / variable / ocio / suscripciones). Regla de derivación (FASE-0 §g-19):
 * - suscripciones = type subscription
 * - ocio          = gasto con categoría Ocio o Viajes
 * - fijo          = gasto de naturaleza fija + domiciliaciones
 * - variable      = el resto de gastos
 */
export type ExpenseKind = 'fixed' | 'variable' | 'leisure' | 'subscriptions';

export const EXPENSE_KINDS: readonly ExpenseKind[] = ['fixed', 'variable', 'leisure', 'subscriptions'];

export const EXPENSE_KIND_LABEL: Readonly<Record<ExpenseKind, string>> = {
  fixed: 'Fijo',
  variable: 'Variable',
  leisure: 'Ocio',
  subscriptions: 'Suscripciones',
};

export type ExpenseKindTotals = Readonly<Record<ExpenseKind, Money>>;

export const EMPTY_KINDS: ExpenseKindTotals = { fixed: ZERO, variable: ZERO, leisure: ZERO, subscriptions: ZERO };

export function expenseKindOf(e: Event, leisureIds: ReadonlySet<string> = new Set(LEISURE_CATEGORY_IDS)): ExpenseKind | null {
  switch (e.type) {
    case 'subscription':
      return 'subscriptions';
    case 'direct_debit':
      return 'fixed';
    case 'expense':
      if (e.categoryId && leisureIds.has(e.categoryId)) return 'leisure';
      return e.nature === 'fixed' ? 'fixed' : 'variable';
    default:
      return null;
  }
}

export function totalsByExpenseKind(events: Iterable<Event>, leisureIds?: ReadonlySet<string>): ExpenseKindTotals {
  const acc: Record<ExpenseKind, number> = { fixed: 0, variable: 0, leisure: 0, subscriptions: 0 };
  for (const e of events) {
    const kind = expenseKindOf(e, leisureIds);
    if (kind) acc[kind] += e.amountCents;
  }
  return { fixed: money(acc.fixed), variable: money(acc.variable), leisure: money(acc.leisure), subscriptions: money(acc.subscriptions) };
}
