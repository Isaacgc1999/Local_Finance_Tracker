import type { Budget, BudgetScope } from '../../core/types/budget';
import type { Event, EventType, Nature } from '../../core/types/event';
import type { IsoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { budgetActual, evaluateBudgets, monthsInRange } from './budget.service';

let seq = 0;
function ev(type: EventType, cents: number, date: string, categoryId: string | null = null, nature: Nature | null = null): Event {
  seq++;
  return {
    id: `e${seq}`,
    type,
    amountCents: money(cents),
    date: date as IsoDate,
    concept: 'x',
    categoryId,
    nature,
    paymentMethod: null,
    notes: null,
    attachmentPath: null,
    recurrenceId: null,
    meta: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function budget(scope: BudgetScope, cents: number): Budget {
  return { id: `b-${scope}`, scope, amountCents: money(cents), createdAt: '', updatedAt: '' };
}

const SEPT = { from: '2026-09-01' as IsoDate, to: '2026-09-30' as IsoDate };

const EVENTS: readonly Event[] = [
  ev('expense', 10_000, '2026-09-02', 'cat-alimentacion', 'variable'),
  ev('expense', 5_000, '2026-09-03', 'cat-hogar', 'fixed'),
  ev('direct_debit', 78_000, '2026-09-01', 'cat-hogar'),
  ev('subscription', 1_399, '2026-09-14', 'cat-ocio'),
  ev('expense', 4_000, '2026-09-10', 'cat-ocio', 'variable'),
  ev('expense', 20_000, '2026-09-12', 'cat-viajes', 'variable'),
  ev('saving', 40_000, '2026-09-06'),
  ev('investment', 25_000, '2026-09-01'),
  ev('income', 241_268, '2026-09-05', 'cat-nomina'),
  // Fuera de septiembre: no debe contar.
  ev('expense', 99_999, '2026-08-31', 'cat-alimentacion', 'variable'),
];

describe('presupuestos por ámbito', () => {
  it('cuenta los meses de calendario del rango', () => {
    expect(monthsInRange(SEPT)).toBe(1);
    expect(monthsInRange({ from: '2026-04-01' as IsoDate, to: '2026-09-30' as IsoDate })).toBe(6);
    expect(monthsInRange({ from: '2025-12-15' as IsoDate, to: '2026-01-10' as IsoDate })).toBe(2);
  });

  it('suma cada ámbito con las mismas reglas que el resto de la app', () => {
    const sept = EVENTS.filter((e) => e.date >= SEPT.from && e.date <= SEPT.to);
    // Gasto total = gastos + suscripciones + domiciliaciones; ni ahorro, ni inversión, ni ingresos.
    expect(budgetActual('total', sept)).toBe(10_000 + 5_000 + 78_000 + 1_399 + 4_000 + 20_000);
    expect(budgetActual('fixed', sept)).toBe(5_000 + 78_000);
    expect(budgetActual('variable', sept)).toBe(10_000);
    // Ocio = categorías Ocio y Viajes (la suscripción va a su propio ámbito).
    expect(budgetActual('leisure', sept)).toBe(4_000 + 20_000);
    expect(budgetActual('subscriptions', sept)).toBe(1_399);
    expect(budgetActual('saving', sept)).toBe(40_000);
    expect(budgetActual('investment', sept)).toBe(25_000);
    expect(budgetActual('category:cat-hogar', sept)).toBe(5_000 + 78_000);
  });

  it('marca el estado de límites y objetivos', () => {
    const rows = evaluateBudgets(
      [budget('leisure', 20_000), budget('variable', 12_000), budget('fixed', 200_000), budget('saving', 40_000), budget('investment', 50_000)],
      EVENTS,
      SEPT,
      (s) => s,
    );
    const by = new Map(rows.map((r) => [r.budget.scope, r]));
    expect(by.get('leisure')?.status).toBe('over');
    expect(by.get('leisure')?.remaining).toBe(20_000 - 24_000);
    expect(by.get('variable')?.status).toBe('near'); // 10.000 de 12.000 = 83 %
    expect(by.get('fixed')?.status).toBe('ok');
    expect(by.get('saving')?.status).toBe('reached');
    expect(by.get('investment')?.status).toBe('pending');
    expect(by.get('investment')?.progressBp).toBe(5000);
  });

  it('multiplica el importe mensual por los meses del rango y ignora lo de fuera', () => {
    const [row] = evaluateBudgets([budget('variable', 10_000)], EVENTS, { from: '2026-08-01' as IsoDate, to: '2026-09-30' as IsoDate }, (s) => s);
    expect(row?.months).toBe(2);
    expect(row?.target).toBe(20_000);
    expect(row?.actual).toBe(10_000 + 99_999);
  });

  it('pone primero los límites y después los objetivos', () => {
    const rows = evaluateBudgets([budget('saving', 1_000), budget('total', 1_000), budget('leisure', 1_000_000)], EVENTS, SEPT, (s) => s);
    expect(rows.map((r) => r.kind)).toEqual(['limit', 'limit', 'goal']);
    expect(rows[0]?.budget.scope).toBe('total'); // el límite con más avance, primero
  });
});
