import { isoDate } from '../../core/types/iso-date';
import { carryForwardSeries, cumulativeSeries, evolutionRange } from './evolution';

const d = isoDate;

describe('evolution', () => {
  it('la ventana mínima es 10 días, 4 meses o 5 años', () => {
    expect(evolutionRange(null, d(2026, 10, 28), 'day').from).toBe(d(2026, 10, 19));
    expect(evolutionRange(null, d(2026, 10, 28), 'month').from).toBe(d(2026, 7, 1));
    expect(evolutionRange(null, d(2026, 10, 28), 'year').from).toBe(d(2022, 1, 1));
    expect(evolutionRange(d(2020, 3, 4), d(2026, 10, 28), 'month').from).toBe(d(2020, 3, 4));
  });

  it('arrastra la última valoración de cada inversión', () => {
    const points = [
      { key: 'a', date: d(2026, 8, 10), value: 1000, secondary: 900 },
      { key: 'b', date: d(2026, 9, 5), value: 500, secondary: 500 },
      { key: 'a', date: d(2026, 10, 2), value: 1200, secondary: 900 },
    ];
    const s = carryForwardSeries(points, { from: d(2026, 7, 1), to: d(2026, 10, 28) }, 'month');
    expect(s.map((p) => p.value)).toEqual([0, 1000, 1500, 1700]);
    expect(s.map((p) => p.secondary)).toEqual([0, 900, 1400, 1400]);
  });

  it('acumula flujos con signo', () => {
    const flows = [
      { date: d(2026, 10, 20), amount: 10000 },
      { date: d(2026, 10, 25), amount: -2500 },
      { date: d(2026, 9, 1), amount: 5000 },
    ];
    const s = cumulativeSeries(flows, { from: d(2026, 10, 19), to: d(2026, 10, 28) }, 'day');
    expect(s[0]?.value).toBe(5000);
    expect(s[1]?.value).toBe(15000);
    expect(s[9]?.value).toBe(12500);
  });
});
