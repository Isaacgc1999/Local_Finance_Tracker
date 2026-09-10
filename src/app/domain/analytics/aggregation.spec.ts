import { SYSTEM_CATEGORY } from '../../core/types/category';
import type { Event, EventType } from '../../core/types/event';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { computeBudgetPace } from '../budget/budget.service';
import { balanceOf, bucketByWeek, lastMonths, outflowOf, totalsByType, weeksOfMonth } from './aggregation';
import { expenseKindOf, totalsByExpenseKind } from './expense-kind';

let n = 0;
const ev = (type: EventType, cents: number, date: string, extra: Partial<Event> = {}): Event => ({
  id: `e${++n}`,
  type,
  amountCents: money(cents),
  date: date as never,
  concept: 'x',
  categoryId: null,
  nature: type === 'expense' ? 'variable' : null,
  paymentMethod: null,
  notes: null,
  attachmentPath: null,
  recurrenceId: null,
  meta: null,
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('aggregation', () => {
  it('totales, gasto y balance como en el handoff (ahorro e inversión no restan)', () => {
    const events = [
      ev('income', 275_268, '2026-09-05'),
      ev('expense', 100_000, '2026-09-08'),
      ev('subscription', 6_598, '2026-09-14'),
      ev('direct_debit', 81_839, '2026-09-01'),
      ev('saving', 40_000, '2026-09-06'),
      ev('investment', 25_000, '2026-09-01'),
    ];
    const t = totalsByType(events);
    expect(outflowOf(t)).toBe(188_437);
    expect(balanceOf(t)).toBe(86_831); // +868,31 €
    expect(t.saving).toBe(40_000);
  });

  it('parte el mes en semanas de lunes a domingo recortadas (septiembre 2026 → 5)', () => {
    const weeks = weeksOfMonth(isoDate(2026, 9, 9));
    expect(weeks.map((w) => [w.from, w.to])).toEqual([
      ['2026-09-01', '2026-09-06'],
      ['2026-09-07', '2026-09-13'],
      ['2026-09-14', '2026-09-20'],
      ['2026-09-21', '2026-09-27'],
      ['2026-09-28', '2026-09-30'],
    ]);
    const buckets = bucketByWeek([ev('expense', 1, '2026-09-01'), ev('expense', 2, '2026-09-30')], isoDate(2026, 9, 1));
    expect(buckets.map((b) => [b.label, b.events.length])).toEqual([['S1', 1], ['S2', 0], ['S3', 0], ['S4', 0], ['S5', 1]]);
    expect(lastMonths(isoDate(2026, 9, 9), 6)[0]).toBe('2026-04-01');
  });

  it('clasifica fijo / variable / ocio / suscripciones', () => {
    expect(expenseKindOf(ev('subscription', 1, '2026-09-01'))).toBe('subscriptions');
    expect(expenseKindOf(ev('direct_debit', 1, '2026-09-01'))).toBe('fixed');
    expect(expenseKindOf(ev('expense', 1, '2026-09-01', { nature: 'fixed' }))).toBe('fixed');
    expect(expenseKindOf(ev('expense', 1, '2026-09-01', { categoryId: SYSTEM_CATEGORY.viajes }))).toBe('leisure');
    expect(expenseKindOf(ev('expense', 1, '2026-09-01', { categoryId: SYSTEM_CATEGORY.ocio, nature: 'fixed' }))).toBe('leisure');
    expect(expenseKindOf(ev('income', 1, '2026-09-01'))).toBeNull();
    const kinds = totalsByExpenseKind([
      ev('expense', 100, '2026-09-01', { nature: 'fixed' }),
      ev('expense', 50, '2026-09-01'),
      ev('subscription', 7, '2026-09-01'),
      ev('saving', 999, '2026-09-01'),
    ]);
    expect(kinds).toEqual({ fixed: 100, variable: 50, leisure: 0, subscriptions: 7 });
  });
});

describe('computeBudgetPace', () => {
  it('reproduce la barra del handoff: 68,5 % consumido, día 9 de 30, 38,5 puntos por delante', () => {
    const pace = computeBudgetPace({
      outflow: money(188_437),
      income: money(275_268),
      budgetTarget: money(175_000),
      monthStart: isoDate(2026, 9, 1),
      today: isoDate(2026, 9, 9),
    });
    expect(pace.base).toBe('income');
    expect(pace.consumedBp).toBe(6846);
    expect(pace.elapsedBp).toBe(3000);
    expect(pace.pacePointsBp).toBe(3846);
    expect(pace.remaining).toBe(86_831);
    expect(pace.projectedClose).toBe(628_123); // 1.884,37 × 30 / 9
    expect(pace.overBudget).toBe(true);
  });

  it('sin ingresos usa el presupuesto objetivo; sin base devuelve null; meses pasados al 100 %', () => {
    const sinIngresos = computeBudgetPace({ outflow: money(50_000), income: money(0), budgetTarget: money(175_000), monthStart: isoDate(2026, 9, 1), today: isoDate(2026, 9, 9) });
    expect(sinIngresos.base).toBe('budget');
    expect(sinIngresos.consumedBp).toBe(2857);
    const sinBase = computeBudgetPace({ outflow: money(50_000), income: money(0), budgetTarget: money(0), monthStart: isoDate(2026, 9, 1), today: isoDate(2026, 9, 9) });
    expect(sinBase.consumedBp).toBeNull();
    expect(sinBase.pacePointsBp).toBeNull();
    const pasado = computeBudgetPace({ outflow: money(1), income: money(1), budgetTarget: money(1), monthStart: isoDate(2026, 8, 1), today: isoDate(2026, 9, 9) });
    expect(pasado.elapsedBp).toBe(10000);
    expect(pasado.projectedClose).toBeNull();
    const futuro = computeBudgetPace({ outflow: money(0), income: money(0), budgetTarget: money(1), monthStart: isoDate(2026, 12, 1), today: isoDate(2026, 9, 9) });
    expect(futuro.elapsedBp).toBe(0);
  });
});
