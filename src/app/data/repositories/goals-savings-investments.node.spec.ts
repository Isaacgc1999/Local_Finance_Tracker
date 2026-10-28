/**
 * Repositorios de objetivos, huchas, inversiones y avisos contra SQLite real
 * con todas las migraciones aplicadas.
 */
import { NodeSqliteDatabase } from '../../../../tools/node-sqlite-database';
import type { EventDraft } from '../../core/types/event';
import type { GoalDraft } from '../../core/types/goal';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { MIGRATIONS } from '../db/migrations';
import { applyPendingMigrations } from '../db/migrator';
import { type Repositories, createRepositories } from '.';

async function fresh(): Promise<Repositories> {
  const db = NodeSqliteDatabase.open();
  const migrated = await applyPendingMigrations(db, MIGRATIONS);
  if (!migrated.ok) throw new Error('migraciones');
  return createRepositories(db);
}

const goal: GoalDraft = {
  name: 'iPhone',
  kind: 'purchase',
  targetCents: money(120_000),
  startDate: isoDate(2026, 10, 1),
  targetDate: isoDate(2027, 6, 1),
  frequency: 'monthly',
  status: 'active',
  color: '#A78BFA',
  notes: null,
};

const gasto = (overrides: Partial<EventDraft> = {}): EventDraft => ({
  type: 'expense',
  amountCents: money(1000),
  date: isoDate(2026, 10, 2),
  concept: 'Mercadona',
  categoryId: null,
  nature: 'variable',
  paymentMethod: null,
  notes: null,
  attachmentPath: null,
  recurrenceId: null,
  accountId: null,
  meta: { type: 'expense' },
  ...overrides,
});

describe('objetivos y huchas', () => {
  it('crear un objetivo crea su hucha y la aportación inicial en la misma transacción', async () => {
    const repos = await fresh();
    const created = await repos.goals.insert(goal, 30_000, isoDate(2026, 10, 5));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const pots = await repos.savings.findPots();
    const pot = pots.ok ? pots.value.find((p) => p.id === created.value.potId) : undefined;
    expect(pot).toMatchObject({ kind: 'goal', name: 'iPhone', goalId: created.value.goal.id, targetCents: 120_000 });
    const entries = await repos.savings.findEntries();
    expect(entries.ok && entries.value.map((e) => [e.potId, e.amountCents, e.date])).toEqual([[created.value.potId, 30_000, '2026-10-05']]);
  });

  it('borrar el objetivo borra su hucha y sus aportaciones; las huchas por defecto no se tocan', async () => {
    const repos = await fresh();
    const created = await repos.goals.insert(goal, 5_000);
    if (!created.ok) throw new Error('alta');
    await repos.goals.delete(created.value.goal.id);
    const pots = await repos.savings.findPots();
    expect(pots.ok && pots.value.map((p) => p.id)).toEqual(['pot-emergency', 'pot-general']);
    const entries = await repos.savings.findEntries();
    expect(entries.ok && entries.value).toEqual([]);
  });

  it('renombrar el objetivo renombra su hucha', async () => {
    const repos = await fresh();
    const created = await repos.goals.insert(goal);
    if (!created.ok) throw new Error('alta');
    await repos.goals.update(created.value.goal.id, { name: 'iPhone 18', targetCents: money(130_000) });
    const pots = await repos.savings.findPots();
    expect(pots.ok && pots.value.find((p) => p.id === created.value.potId)).toMatchObject({ name: 'iPhone 18', targetCents: 130_000 });
  });
});

describe('inversiones', () => {
  it('una valoración del mismo día sustituye a la anterior', async () => {
    const repos = await fresh();
    const created = await repos.investments.insert(
      { name: 'MSCI World', issuer: 'Vanguard', assetClass: 'index_fund', ticker: 'IE00B03HCZ61', units: 12.5, color: '#38BDF8', archived: false, sortOrder: 0 },
      { date: isoDate(2026, 10, 1), marketValueCents: money(100_000), investedCents: money(95_000) },
    );
    if (!created.ok) throw new Error('alta');
    const id = created.value.id;
    await repos.investments.upsertValuation({ investmentId: id, date: isoDate(2026, 10, 1), marketValueCents: money(101_000), investedCents: money(95_000) });
    await repos.investments.upsertValuation({ investmentId: id, date: isoDate(2026, 10, 20), marketValueCents: money(104_000), investedCents: money(100_000) });
    const vals = await repos.investments.findValuations();
    expect(vals.ok && vals.value.map((v) => [v.date, v.marketValueCents])).toEqual([
      ['2026-10-01', 101_000],
      ['2026-10-20', 104_000],
    ]);
    await repos.investments.delete(id);
    const after = await repos.investments.findValuations();
    expect(after.ok && after.value).toEqual([]);
  });
});

describe('movimientos importados y avisos', () => {
  it('deshacer una importación borra solo su lote', async () => {
    const repos = await fresh();
    await repos.events.insertMany([gasto({ source: 'import', importBatch: 'lote-1' }), gasto({ source: 'import', importBatch: 'lote-1', concept: 'Lidl' })]);
    await repos.events.insertMany([gasto({ concept: 'A mano' })]);
    const undone = await repos.events.deleteImportBatch('lote-1');
    expect(undone.ok && undone.value.deleted).toBe(2);
    const left = await repos.events.findInRange({ from: isoDate(2026, 10, 1), to: isoDate(2026, 10, 31) });
    expect(left.ok && left.value.map((e) => [e.concept, e.source])).toEqual([['A mano', 'manual']]);
  });

  it('el registro de avisos recuerda lo enviado', async () => {
    const repos = await fresh();
    await repos.notificationLog.mark(['backup:2026-10', 'backup:2026-10']);
    const sent = await repos.notificationLog.sent(['backup:2026-10', 'payday:2026-11']);
    expect(sent.ok && [...sent.value]).toEqual(['backup:2026-10']);
  });
});
