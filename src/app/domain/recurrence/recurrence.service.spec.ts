import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import type { Recurrence } from '../../core/types/recurrence';
import { dueInstances, expand, mergeWithMaterialized, nextOccurrence, occurrencesBetween } from './recurrence.service';

const base: Recurrence = {
  id: 'r1',
  type: 'subscription',
  amountCents: money(1399),
  categoryId: null,
  concept: 'Netflix',
  frequency: 'monthly',
  interval: 1,
  dayOfMonth: null,
  weekday: null,
  startDate: isoDate(2026, 1, 31),
  endDate: null,
  active: true,
  paymentMethod: null,
  meta: null,
  createdAt: '',
  updatedAt: '',
};

const rule = (overrides: Partial<Recurrence>): Recurrence => ({ ...base, ...overrides });
const dates = (r: Recurrence, from: string, to: string) =>
  occurrencesBetween(r, from as never, to as never);

describe('RecurrenceService', () => {
  it('día 31: último día del mes en meses de 30 y en febrero', () => {
    const r = rule({ dayOfMonth: 31 });
    expect(dates(r, '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
  });

  it('día 31 en año bisiesto cae en 29 de febrero', () => {
    const r = rule({ startDate: isoDate(2028, 1, 31), dayOfMonth: 31 });
    expect(dates(r, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('cruza el cambio de año', () => {
    const r = rule({ startDate: isoDate(2026, 11, 15), dayOfMonth: 15 });
    expect(dates(r, '2026-11-01', '2027-02-28')).toEqual(['2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15']);
    const anual = rule({ frequency: 'yearly', startDate: isoDate(2024, 2, 29), dayOfMonth: 29 });
    expect(dates(anual, '2024-01-01', '2028-12-31')).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('regla desactivada a mitad de periodo deja de generar desde end_date', () => {
    const r = rule({ startDate: isoDate(2026, 1, 14), dayOfMonth: 14, endDate: isoDate(2026, 9, 19) });
    expect(dates(r, '2026-08-01', '2026-12-31')).toEqual(['2026-08-14', '2026-09-14']);
    const off = rule({ active: false });
    expect(expand(off, isoDate(2026, 1, 1), isoDate(2026, 12, 31))).toEqual([]);
    expect(nextOccurrence(off, isoDate(2026, 1, 1))).toBeNull();
  });

  it('semanal respeta el día de la semana y el intervalo', () => {
    // 2026-09-01 es martes; regla los lunes cada 2 semanas
    const r = rule({ frequency: 'weekly', weekday: 1, interval: 2, startDate: isoDate(2026, 9, 1) });
    expect(dates(r, '2026-09-01', '2026-10-31')).toEqual(['2026-09-07', '2026-09-21', '2026-10-05', '2026-10-19']);
  });

  it('solo devuelve fechas dentro del rango pedido y empieza en la fecha de inicio', () => {
    const r = rule({ startDate: isoDate(2026, 3, 10), dayOfMonth: 10 });
    expect(dates(r, '2026-01-01', '2026-02-28')).toEqual([]);
    expect(dates(r, '2026-06-01', '2026-07-31')).toEqual(['2026-06-10', '2026-07-10']);
    expect(dates(r, '2030-06-01', '2030-06-30')).toEqual(['2030-06-10']); // salto largo
  });

  it('nextOccurrence devuelve la siguiente estricta y null tras end_date', () => {
    const r = rule({ startDate: isoDate(2026, 1, 14), dayOfMonth: 14, endDate: isoDate(2026, 10, 31) });
    expect(nextOccurrence(r, isoDate(2026, 9, 9))).toBe('2026-09-14');
    expect(nextOccurrence(r, isoDate(2026, 9, 14))).toBe('2026-10-14');
    expect(nextOccurrence(r, isoDate(2026, 10, 14))).toBeNull();
  });

  it('la instancia materializada (y editada) gana: no se regenera', () => {
    const r = rule({ startDate: isoDate(2026, 7, 14), dayOfMonth: 14 });
    const real = new Set([isoDate(2026, 8, 14)]);
    const merged = mergeWithMaterialized(expand(r, isoDate(2026, 7, 1), isoDate(2026, 9, 30)), real);
    expect(merged.map((v) => [v.date, v.materialized])).toEqual([
      ['2026-07-14', false],
      ['2026-08-14', true],
      ['2026-09-14', false],
    ]);
    const due = dueInstances(r, isoDate(2026, 9, 9), real);
    expect(due.map((d) => d.date)).toEqual(['2026-07-14']);
    expect(due[0]?.recurrenceId).toBe('r1');
    expect(due[0]?.nature).toBeNull();
    const gasto = rule({ type: 'expense', startDate: isoDate(2026, 9, 1), dayOfMonth: 1 });
    expect(dueInstances(gasto, isoDate(2026, 9, 9), new Set())[0]?.nature).toBe('fixed');
  });
});
