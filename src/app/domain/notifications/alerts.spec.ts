import { isoDate } from '../../core/types/iso-date';
import { type Money, money } from '../../core/types/money';
import type { Recurrence } from '../../core/types/recurrence';
import { type AlertInput, pendingAlerts } from './alerts';

const rule = (overrides: Partial<Recurrence>): Recurrence => ({
  id: 'r1',
  type: 'subscription',
  amountCents: money(1399),
  categoryId: null,
  concept: 'Netflix',
  frequency: 'monthly',
  interval: 1,
  dayOfMonth: 15,
  weekday: null,
  startDate: isoDate(2026, 1, 15),
  endDate: null,
  active: true,
  paymentMethod: null,
  accountId: null,
  meta: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

const base: AlertInput = {
  today: isoDate(2026, 10, 14),
  format: (m: Money) => `${(m / 100).toFixed(2)} €`,
  recurrences: [],
  paydayMonth: null,
  budget: null,
  goals: [],
  holdings: [],
  lastBackupAt: '2026-10-10T10:00:00.000Z',
};

const keys = (input: Partial<AlertInput>) => pendingAlerts({ ...base, ...input }).map((a) => a.key);

describe('pendingAlerts', () => {
  it('sin nada pendiente no avisa', () => {
    expect(keys({})).toEqual([]);
  });

  it('avisa de un cargo de mañana, y agrupa si son varios; los ingresos no cuentan', () => {
    expect(keys({ recurrences: [rule({})] })).toEqual(['charge:r1:2026-10-15']);
    const varios = pendingAlerts({ ...base, recurrences: [rule({}), rule({ id: 'r2', concept: 'Gimnasio', amountCents: money(3000) }), rule({ id: 'r3', type: 'income' })] });
    expect(varios.map((a) => a.key)).toEqual(['charges:2026-10-15']);
    expect(varios[0]?.title).toBe('2 cargos mañana');
    expect(varios[0]?.body).toContain('43.99 €');
  });

  it('nómina: solo los primeros días del mes financiero', () => {
    const p = { label: isoDate(2026, 11, 1), from: isoDate(2026, 10, 13), name: 'noviembre' };
    expect(keys({ paydayMonth: p })).toEqual(['payday:2026-11']);
    expect(keys({ paydayMonth: { ...p, from: isoDate(2026, 10, 1) } })).toEqual([]);
  });

  it('presupuesto: 100 %, 80 % y ritmo, uno solo cada vez', () => {
    const b = { label: isoDate(2026, 10, 1), target: money(100_000), projectedClose: null };
    expect(keys({ budget: { ...b, outflow: money(100_000) } })).toEqual(['budget100:2026-10']);
    expect(keys({ budget: { ...b, outflow: money(85_000) } })).toEqual(['budget80:2026-10']);
    expect(keys({ budget: { ...b, outflow: money(40_000), projectedClose: money(120_000) } })).toEqual(['budgetpace:2026-10']);
    expect(keys({ budget: { ...b, outflow: money(40_000), projectedClose: money(90_000) } })).toEqual([]);
  });

  it('objetivos: conseguido o a menos de una semana; los cerrados no', () => {
    const g = { id: 'g1', name: 'iPhone', targetDate: isoDate(2026, 10, 20), status: 'active' as const, achieved: false, remaining: money(20_000) };
    expect(keys({ goals: [g] })).toEqual(['goal-deadline:g1:2026-10-20']);
    expect(keys({ goals: [{ ...g, targetDate: isoDate(2026, 12, 1) }] })).toEqual([]);
    expect(keys({ goals: [{ ...g, achieved: true }] })).toEqual(['goal-reached:g1']);
    expect(keys({ goals: [{ ...g, status: 'archived' }] })).toEqual([]);
  });

  it('inversiones sin actualizar y copia de seguridad antigua, una vez al mes', () => {
    expect(keys({ holdings: [{ name: 'MSCI World', lastUpdate: isoDate(2026, 9, 1) }, { name: 'BTC', lastUpdate: isoDate(2026, 10, 10) }] })).toEqual(['holdings-stale:2026-10']);
    expect(keys({ lastBackupAt: null })).toEqual(['backup:2026-10']);
    expect(keys({ lastBackupAt: '2026-08-01T00:00:00.000Z' })).toEqual(['backup:2026-10']);
  });
});
