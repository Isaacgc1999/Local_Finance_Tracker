import { SYSTEM_CATEGORY, type Category } from '../../core/types/category';
import type { Event, EventType } from '../../core/types/event';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { type AnalyticsInput, computeSnapshot } from './analytics.service';
import { historyStart, periodsBetween, previousRange } from './periods';
import { mean, median, movingAverage, varianceAndStdDev } from './stats';

let n = 0;
const ev = (type: EventType, cents: number, date: string, categoryId: string | null = null): Event => ({
  id: `e${++n}`,
  type,
  amountCents: money(cents),
  date: date as never,
  concept: 'x',
  categoryId,
  nature: type === 'expense' ? 'variable' : null,
  paymentMethod: null,
  notes: null,
  attachmentPath: null,
  recurrenceId: null,
  meta: null,
  createdAt: '',
  updatedAt: '',
});

const categories = new Map<string, Category>([
  [SYSTEM_CATEGORY.alimentacion, { id: SYSTEM_CATEGORY.alimentacion, name: 'Alimentación', icon: null, color: '#F45B5B', kind: 'expense', isSystem: true, sortOrder: 0 }],
  [SYSTEM_CATEGORY.hogar, { id: SYSTEM_CATEGORY.hogar, name: 'Hogar', icon: null, color: '#FBBF24', kind: 'expense', isSystem: true, sortOrder: 1 }],
]);

const base = (events: Event[], overrides: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  events,
  range: { from: isoDate(2026, 4, 1), to: isoDate(2026, 9, 30) },
  granularity: 'month',
  categories,
  budgetTargetCents: money(175_000),
  today: isoDate(2026, 9, 9),
  openingBalanceCents: money(0),
  savingsTargetBp: 3000,
  ...overrides,
});

describe('stats', () => {
  it('mediana, media, varianza y media móvil en enteros', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3); // (2+3)/2 = 2,5 → 3
    expect(mean([1, 2, 4])).toBe(2);
    expect(varianceAndStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({ variance: 4, stdDev: 2 });
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe('periods', () => {
  it('genera los periodos del rango en las cuatro granularidades', () => {
    const range = { from: isoDate(2026, 4, 1), to: isoDate(2026, 9, 30) };
    expect(periodsBetween(range, 'month').map((p) => p.label)).toEqual(['Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep']);
    expect(periodsBetween(range, 'year').map((p) => p.key)).toEqual(['2026']);
    expect(periodsBetween({ from: isoDate(2026, 9, 7), to: isoDate(2026, 9, 20) }, 'week').map((p) => p.label)).toEqual(['S37', 'S38']);
    expect(periodsBetween({ from: isoDate(2026, 9, 1), to: isoDate(2026, 9, 3) }, 'day').map((p) => p.key)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    // Recorte: la semana que empieza el 31 de agosto queda desde el 1 de septiembre.
    expect(periodsBetween({ from: isoDate(2026, 9, 1), to: isoDate(2026, 9, 6) }, 'week')[0]).toMatchObject({ from: '2026-09-01', to: '2026-09-06' });
    expect(previousRange({ from: isoDate(2026, 9, 1), to: isoDate(2026, 9, 30) })).toEqual({ from: '2026-08-02', to: '2026-08-31' });
    expect(historyStart(range, 'month', 3)).toBe('2026-01-01');
  });
});

describe('computeSnapshot', () => {
  const events = [
    // Abril–agosto: nómina y gasto fijo
    ...['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].flatMap((m) => [
      ev('income', 241_268, `${m}-05`),
      ev('direct_debit', 78_000, `${m}-01`, SYSTEM_CATEGORY.hogar),
      ev('expense', 40_000, `${m}-10`, SYSTEM_CATEGORY.alimentacion),
    ]),
    // Septiembre
    ev('income', 275_268, '2026-09-05'),
    ev('direct_debit', 78_000, '2026-09-01', SYSTEM_CATEGORY.hogar),
    ev('expense', 30_000, '2026-09-08', SYSTEM_CATEGORY.alimentacion),
    ev('expense', 10_000, '2026-09-08', SYSTEM_CATEGORY.alimentacion),
    ev('saving', 40_000, '2026-09-06'),
    ev('investment', 25_000, '2026-09-01'),
    // Historia previa al rango (marzo, enero): entra en la varianza / saldo inicial la calcula la facade
    ev('direct_debit', 78_000, '2026-03-01', SYSTEM_CATEGORY.hogar),
    ev('expense', 200_000, '2026-01-15', SYSTEM_CATEGORY.alimentacion),
  ];

  it('totales, tasa de ahorro, medias y mediana', () => {
    const s = computeSnapshot(base(events));
    expect(s.eventCount).toBe(21);
    expect(s.income).toBe(241_268 * 5 + 275_268);
    expect(s.outflow).toBe(118_000 * 5 + 118_000);
    expect(s.savingsRateBp).toBe(5221); // (1.481.608 − 708.000) / 1.481.608 = 52,2 %
    expect(s.days).toBe(183);
    expect(s.dailyAverage).toBe(Math.round(708_000 / 183));
    expect(s.outflowCount).toBe(13);
    expect(s.medianPerEvent).toBe(40_000);
    expect(s.averagePerEvent).toBe(Math.round(708_000 / 13));
    expect(s.byExpenseKind.fixed).toBe(78_000 * 6);
  });

  it('desglose por categoría con proporciones y variación vs periodo anterior', () => {
    const s = computeSnapshot(base(events, { range: { from: isoDate(2026, 9, 1), to: isoDate(2026, 9, 30) } }));
    const hogar = s.byCategory.find((c) => c.categoryId === SYSTEM_CATEGORY.hogar);
    const alim = s.byCategory.find((c) => c.categoryId === SYSTEM_CATEGORY.alimentacion);
    expect(s.byCategory[0]?.label).toBe('Hogar');
    expect(hogar?.shareOfExpensesBp).toBe(6610); // 78.000 / 118.000
    expect(hogar?.shareOfIncomeBp).toBe(2834);
    // El periodo anterior a septiembre es 2–31 de agosto: el alquiler del día 1 queda fuera → sin base.
    expect(hogar?.deltaVsPreviousBp).toBeNull();
    expect(alim?.count).toBe(2);
    expect(alim?.averagePerEvent).toBe(20_000);
    expect(alim?.deltaVsPreviousBp).toBe(0); // 40.000 en agosto → 40.000 en septiembre
  });

  it('varianza frente a la media de los 3 periodos anteriores, con historia fuera del rango', () => {
    const s = computeSnapshot(base(events));
    expect(s.variance.currentOutflow).toBe(118_000);
    expect(s.variance.previousOutflows).toEqual([118_000, 118_000, 118_000]);
    expect(s.variance.deltaBp).toBe(0);
    expect(s.variance.stdDevCents).toBe(0);
    const solo = computeSnapshot(base(events, { range: { from: isoDate(2026, 4, 1), to: isoDate(2026, 4, 30) } }));
    expect(solo.variance.previousOutflows).toEqual([200_000, 0, 78_000]); // ene, feb, mar
    expect(solo.variance.previousMean).toBe(92_667);
    expect(solo.variance.deltaBp).toBe(2734); // (118.000 − 92.667) / 92.667
  });

  it('series por periodo, saldo acumulado con saldo inicial y medias móviles', () => {
    const s = computeSnapshot(base(events, { openingBalanceCents: money(100_000) }));
    expect(s.periods.map((p) => p.label)).toEqual(['Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep']);
    expect(s.periods[0]?.cumulative).toBe(100_000 + 241_268 - 118_000);
    expect(s.currentBalance).toBe(100_000 + 1_481_608 - 708_000);
    expect(s.balanceVariation).toBe(1_481_608 - 708_000);
    expect(s.movingAverage3Periods.slice(0, 3)).toEqual([null, null, expect.any(Number)]);
    expect(s.daily.length).toBe(183);
    expect(s.movingAverage7[5]).toBeNull();
    expect(s.movingAverage7[6]).not.toBeNull();
    expect(s.movingAverage30[29]).not.toBeNull();
    expect(s.periods[5]?.saving).toBe(40_000);
    expect(s.periods[5]?.investment).toBe(25_000);
  });

  it('comparativa con el periodo anterior y burn rate del mes en curso', () => {
    const s = computeSnapshot(base(events, { range: { from: isoDate(2026, 9, 1), to: isoDate(2026, 9, 30) } }));
    // Periodo anterior = 2–31 de agosto: solo la compra del día 10.
    expect(s.comparison.previousOutflow).toBe(40_000);
    expect(s.comparison.outflowDeltaAbs).toBe(78_000);
    expect(s.comparison.incomeDeltaAbs).toBe(275_268 - 241_268);
    expect(s.burn?.dayOfMonth).toBe(9);
    expect(s.burn?.projectedClose).toBe(Math.round((118_000 * 30) / 9));
    const pasado = computeSnapshot(base(events, { range: { from: isoDate(2026, 4, 1), to: isoDate(2026, 4, 30) } }));
    expect(pasado.burn).toBeNull();
  });

  it('sin ingresos ni movimientos devuelve null, nunca NaN', () => {
    const s = computeSnapshot(base([]));
    expect(s.savingsRateBp).toBeNull();
    expect(s.outflowShareOfIncomeBp).toBeNull();
    expect(s.medianPerEvent).toBeNull();
    expect(s.averagePerEvent).toBeNull();
    expect(s.variance.deltaBp).toBeNull();
    expect(s.comparison.outflowDeltaBp).toBeNull();
    expect(s.byCategory).toEqual([]);
    expect(Number.isNaN(s.dailyAverage)).toBe(false);
  });
});
