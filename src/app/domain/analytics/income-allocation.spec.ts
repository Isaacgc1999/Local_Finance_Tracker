import { money } from '../../core/types/money';
import { EMPTY_TOTALS } from './aggregation';
import { EMPTY_KINDS } from './expense-kind';
import { incomeAllocation } from './income-allocation';

describe('incomeAllocation', () => {
  it('reparte la nómina y deja el resto sin asignar', () => {
    const a = incomeAllocation(
      { ...EMPTY_TOTALS, income: money(200_000), saving: money(30_000), investment: money(20_000) },
      { ...EMPTY_KINDS, fixed: money(80_000), variable: money(40_000) },
    );
    expect(a.slices.map((s) => [s.key, s.amount])).toEqual([
      ['fixed', 80_000],
      ['variable', 40_000],
      ['saving', 30_000],
      ['investment', 20_000],
      ['free', 30_000],
    ]);
    expect(a.slices[0]?.shareBp).toBe(4000);
    expect(a.savingsRateBp).toBe(2500);
    expect(a.shortfall).toBe(0);
  });

  it('si sale más de lo que entra, no hay sin asignar y dice cuánto falta', () => {
    const a = incomeAllocation({ ...EMPTY_TOTALS, income: money(100_000) }, { ...EMPTY_KINDS, fixed: money(120_000) });
    expect(a.slices.map((s) => s.key)).toEqual(['fixed']);
    expect(a.shortfall).toBe(20_000);
  });

  it('sin ingresos los porcentajes son nulos', () => {
    const a = incomeAllocation(EMPTY_TOTALS, { ...EMPTY_KINDS, variable: money(5_000) });
    expect(a.slices[0]?.shareBp).toBeNull();
    expect(a.savingsRateBp).toBeNull();
  });
});
