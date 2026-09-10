import {
  type BaseBudgetScope,
  BUDGET_SCOPE_LABEL,
  type Budget,
  type BudgetKind,
  type BudgetScope,
  budgetKindOf,
  categoryIdOf,
} from '../../core/types/budget';
import { LEISURE_CATEGORY_IDS } from '../../core/types/category';
import { type Event, isOutflow } from '../../core/types/event';
import {
  type DateRange,
  type IsoDate,
  day,
  daysInMonth,
  isBetween,
  month,
  monthKey,
  startOfMonth,
  year,
} from '../../core/types/iso-date';
import { type Money, ZERO, money, ratioBasisPoints, subMoney } from '../../core/types/money';
import { expenseKindOf } from '../analytics/expense-kind';

export interface BudgetPaceInput {
  readonly outflow: Money;
  readonly income: Money;
  readonly budgetTarget: Money;
  readonly monthStart: IsoDate;
  readonly today: IsoDate;
}

export interface BudgetPace {
  /** Base de la barra: ingresos del mes (handoff) o, sin ingresos, el presupuesto objetivo. */
  readonly base: 'income' | 'budget';
  readonly baseAmount: Money;
  /** Gasto / base en puntos básicos; null si la base es 0. */
  readonly consumedBp: number | null;
  readonly remaining: Money | null;
  readonly dayOfMonth: number;
  readonly daysInMonth: number;
  /** Fracción del mes transcurrida en puntos básicos (día 9 de 30 → 3000). */
  readonly elapsedBp: number;
  /** consumido − transcurrido; positivo = «por delante del ritmo». */
  readonly pacePointsBp: number | null;
  /** Extrapolación lineal del gasto al cierre; solo en el mes en curso. */
  readonly projectedClose: Money | null;
  readonly overBudget: boolean;
}

/**
 * Ritmo del mes: barra «Presupuesto consumido» + proyección de cierre
 * contra el presupuesto objetivo (regla de burn rate). Todo en enteros.
 */
export function computeBudgetPace(input: BudgetPaceInput): BudgetPace {
  const { outflow, income, budgetTarget, today } = input;
  const monthStart = startOfMonth(input.monthStart);
  const dim = daysInMonth(year(monthStart), month(monthStart));

  const sameMonth = monthKey(today) === monthKey(monthStart);
  const isPast = monthStart < startOfMonth(today);
  const dayOfMonth = sameMonth ? day(today) : isPast ? dim : 0;

  const base: BudgetPace['base'] = income > 0 ? 'income' : 'budget';
  const baseAmount = base === 'income' ? income : budgetTarget;
  const consumedBp = ratioBasisPoints(outflow, baseAmount);
  const elapsedBp = Math.round((dayOfMonth * 10000) / dim);

  const projectedClose =
    sameMonth && dayOfMonth > 0 ? money(Math.round((outflow * dim) / dayOfMonth)) : null;

  return {
    base,
    baseAmount,
    consumedBp,
    remaining: baseAmount > 0 ? subMoney(baseAmount, outflow) : null,
    dayOfMonth,
    daysInMonth: dim,
    elapsedBp,
    pacePointsBp: consumedBp === null ? null : consumedBp - elapsedBp,
    projectedClose,
    overBudget: projectedClose !== null && budgetTarget > ZERO && projectedClose > budgetTarget,
  };
}

// ── Presupuestos por ámbito ──────────────────────────────────────────────

export type BudgetStatus = 'ok' | 'near' | 'over' | 'reached' | 'pending';

export interface BudgetProgress {
  readonly budget: Budget;
  readonly label: string;
  readonly kind: BudgetKind;
  /** Meses de calendario que toca el rango: el presupuesto es mensual. */
  readonly months: number;
  /** Importe mensual × meses. */
  readonly target: Money;
  readonly actual: Money;
  /** actual / target en puntos básicos (10000 = 100 %). */
  readonly progressBp: number;
  /** target − actual: negativo si un límite se ha superado. */
  readonly remaining: Money;
  readonly status: BudgetStatus;
}

/** Un límite se marca «cerca» a partir del 80 %. */
const NEAR_LIMIT_BP = 8000;

/** Meses de calendario distintos entre `from` y `to`, ambos incluidos. */
export function monthsInRange(range: DateRange): number {
  const from = year(range.from) * 12 + month(range.from);
  const to = year(range.to) * 12 + month(range.to);
  return Math.max(1, to - from + 1);
}

/** Cuánto ha movido un ámbito en un conjunto de movimientos. */
export function budgetActual(
  scope: BudgetScope,
  events: Iterable<Event>,
  leisureIds: ReadonlySet<string> = new Set(LEISURE_CATEGORY_IDS),
): Money {
  const categoryId = categoryIdOf(scope);
  let total = 0;
  for (const e of events) {
    if (categoryId !== null) {
      if (isOutflow(e.type) && e.categoryId === categoryId) total += e.amountCents;
      continue;
    }
    switch (scope) {
      case 'total':
        if (isOutflow(e.type)) total += e.amountCents;
        break;
      case 'saving':
      case 'investment':
        if (e.type === scope) total += e.amountCents;
        break;
      default:
        if (expenseKindOf(e, leisureIds) === scope) total += e.amountCents;
    }
  }
  return money(total);
}

/**
 * Avance de cada presupuesto en un rango. Puro y entero: el rango decide
 * cuántos meses de presupuesto se comparan (un mes en el dashboard, seis si
 * la analítica mira de abril a septiembre).
 */
export function evaluateBudgets(
  budgets: readonly Budget[],
  events: readonly Event[],
  range: DateRange,
  labelOf: (scope: BudgetScope) => string,
  leisureIds?: ReadonlySet<string>,
): readonly BudgetProgress[] {
  const months = monthsInRange(range);
  const inRange = events.filter((e) => isBetween(e.date, range.from, range.to));
  const rows = budgets.map((budget): BudgetProgress => {
    const kind = budgetKindOf(budget.scope);
    const target = money(budget.amountCents * months);
    const actual = budgetActual(budget.scope, inRange, leisureIds);
    const progressBp = target > 0 ? Math.round((actual * 10000) / target) : 0;
    const status: BudgetStatus =
      kind === 'goal'
        ? progressBp >= 10000
          ? 'reached'
          : 'pending'
        : progressBp > 10000
          ? 'over'
          : progressBp >= NEAR_LIMIT_BP
            ? 'near'
            : 'ok';
    return {
      budget,
      label: labelOf(budget.scope),
      kind,
      months,
      target,
      actual,
      progressBp,
      remaining: subMoney(target, actual),
      status,
    };
  });
  // Primero los límites y después los objetivos, cada grupo de más a menos avance.
  return rows.sort((a, b) => (a.kind === b.kind ? b.progressBp - a.progressBp : a.kind === 'limit' ? -1 : 1));
}

/** Nombre visible de un ámbito, con el de la categoría cuando toca. */
export function budgetLabel(scope: BudgetScope, categories: ReadonlyMap<string, { readonly name: string }>): string {
  const categoryId = categoryIdOf(scope);
  if (categoryId !== null) return categories.get(categoryId)?.name ?? 'Categoría eliminada';
  return BUDGET_SCOPE_LABEL[scope as BaseBudgetScope];
}
