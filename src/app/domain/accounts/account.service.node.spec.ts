import { NodeSqliteDatabase } from '../../../../tools/node-sqlite-database';
import type { Account, AccountDraft, Transfer } from '../../core/types/account';
import { SYSTEM_CATEGORY } from '../../core/types/category';
import type { Event, EventDraft } from '../../core/types/event';
import { type IsoDate, isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { MIGRATIONS } from '../../data/db/migrations';
import { applyPendingMigrations } from '../../data/db/migrator';
import { type Repositories, createRepositories } from '../../data/repositories';
import { AccountService, balanceFromFlows, buildLedger, validateTransferDraft } from './account.service';

async function fresh(): Promise<{ repos: Repositories; service: AccountService }> {
  const db = NodeSqliteDatabase.open();
  const migrated = await applyPendingMigrations(db, MIGRATIONS);
  if (!migrated.ok) throw new Error('migraciones');
  const repos = createRepositories(db);
  return { repos, service: new AccountService(repos) };
}

const draft = (overrides: Partial<Omit<AccountDraft, 'sortOrder'>> = {}): Omit<AccountDraft, 'sortOrder'> => ({
  name: 'BBVA',
  kind: 'bank',
  color: '#6E56F8',
  openingBalanceCents: money(150_000),
  openingDate: isoDate(2026, 9, 1),
  archived: false,
  ...overrides,
});

const movimiento = (accountId: string | null, overrides: Partial<EventDraft> = {}): EventDraft => ({
  type: 'expense',
  amountCents: money(7241),
  date: isoDate(2026, 9, 8),
  concept: 'Mercadona',
  categoryId: SYSTEM_CATEGORY.alimentacion,
  nature: 'variable',
  paymentMethod: null,
  notes: null,
  attachmentPath: null,
  recurrenceId: null,
  accountId,
  meta: { type: 'expense' },
  ...overrides,
});

async function crear(service: AccountService, overrides: Partial<Omit<AccountDraft, 'sortOrder'>> = {}): Promise<Account> {
  const created = await service.create(draft(overrides));
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return created.value;
}

describe('balanceFromFlows', () => {
  const account: Account = {
    id: 'a',
    name: 'BBVA',
    kind: 'bank',
    color: '#6E56F8',
    openingBalanceCents: money(10_000),
    openingDate: isoDate(2026, 9, 1),
    archived: false,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  };

  it('suma apertura, ingresos, traspasos y ajustes y resta el resto de tipos', () => {
    const flows = {
      eventsByType: new Map([
        ['income', 50_000],
        ['expense', 12_000],
        ['saving', 5_000],
      ] as const),
      transfersIn: 1_000,
      transfersOut: 3_000,
      adjustments: -250,
    };
    // 10.000 + 50.000 − 12.000 − 5.000 + 1.000 − 3.000 − 250
    expect(balanceFromFlows(account, flows, isoDate(2026, 9, 30))).toBe(40_750);
  });

  it('antes de la apertura la cuenta vale 0', () => {
    const flows = { eventsByType: new Map(), transfersIn: 0, transfersOut: 0, adjustments: 0 };
    expect(balanceFromFlows(account, flows, isoDate(2026, 8, 31))).toBe(0);
  });
});

describe('buildLedger', () => {
  it('mezcla movimientos y traspasos por fecha y lleva el saldo corrido', () => {
    const ev = (id: string, date: IsoDate, type: Event['type'], cents: number, createdAt: string): Event => ({
      ...movimiento('a', { type, date, amountCents: money(cents), concept: id }),
      id,
      createdAt,
      updatedAt: createdAt,
    });
    const tr: Transfer = {
      id: 't',
      fromAccountId: 'a',
      toAccountId: 'b',
      amountCents: money(2_000),
      date: isoDate(2026, 9, 5),
      concept: null,
      createdAt: '2026-09-05T08:00:00Z',
      updatedAt: '',
    };
    const ledger = buildLedger(
      'a',
      money(10_000),
      [ev('nómina', isoDate(2026, 9, 5), 'income', 5_000, '2026-09-05T09:00:00Z'), ev('súper', isoDate(2026, 9, 2), 'expense', 1_500, '2026-09-02T10:00:00Z')],
      [tr],
      new Map([['b', 'Ahorro']]),
    );
    expect(ledger.map((l) => [l.concept, l.amountCents, l.balanceCents])).toEqual([
      ['súper', -1_500, 8_500],
      ['Traspaso a Ahorro', -2_000, 6_500],
      ['nómina', 5_000, 11_500],
    ]);
  });
});

describe('validateTransferDraft', () => {
  it('rechaza una fecha anterior a la apertura de cualquiera de las dos cuentas', () => {
    const base = { name: '', kind: 'bank', color: '#000000', openingBalanceCents: money(0), archived: false, sortOrder: 0, createdAt: '', updatedAt: '' } as const;
    const accounts = new Map<string, Account>([
      ['a', { ...base, id: 'a', name: 'BBVA', openingDate: isoDate(2026, 1, 1) }],
      ['b', { ...base, id: 'b', name: 'Revolut', openingDate: isoDate(2026, 9, 1) }],
    ]);
    const result = validateTransferDraft({ fromAccountId: 'a', toAccountId: 'b', amountCents: money(100), date: isoDate(2026, 8, 1), concept: ' ' }, accounts);
    expect(!result.ok && result.error.map((e) => e.message)).toEqual(['Revolut se abrió después de esa fecha.']);
    const okResult = validateTransferDraft({ fromAccountId: 'a', toAccountId: 'b', amountCents: money(100), date: isoDate(2026, 9, 1), concept: ' ' }, accounts);
    expect(okResult.ok && okResult.value.concept).toBe(null);
  });
});

describe('AccountService (SQLite real)', () => {
  it('los saldos cuentan movimientos y traspasos, y el traspaso no cambia el total', async () => {
    const { repos, service } = await fresh();
    const bbva = await crear(service);
    const cash = await crear(service, { name: 'Efectivo', kind: 'cash', openingBalanceCents: money(2_000) });
    expect(cash.sortOrder).toBe(1);

    await repos.events.insert(movimiento(bbva.id));
    await repos.events.insert(movimiento(null, { amountCents: money(99_999) })); // sin cuenta: no suma en ninguna
    const before = await service.balances(isoDate(2026, 9, 30));
    const t = await service.createTransfer({ fromAccountId: bbva.id, toAccountId: cash.id, amountCents: money(5_000), date: isoDate(2026, 9, 10), concept: 'Cajero' });
    expect(t.ok).toBe(true);
    const after = await service.balances(isoDate(2026, 9, 30));

    expect(before.ok && before.value.get(bbva.id)).toBe(150_000 - 7_241);
    expect(after.ok && after.value.get(bbva.id)).toBe(150_000 - 7_241 - 5_000);
    expect(after.ok && after.value.get(cash.id)).toBe(2_000 + 5_000);
    const sum = (m: ReadonlyMap<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    expect(before.ok && after.ok && sum(after.value)).toBe(before.ok ? sum(before.value) : NaN);
  });

  it('no borra una cuenta con movimientos: pide archivarla', async () => {
    const { repos, service } = await fresh();
    const bbva = await crear(service);
    await repos.events.insert(movimiento(bbva.id));
    const removed = await service.remove(bbva.id);
    expect(!removed.ok && removed.error.kind).toBe('validation');

    const empty = await crear(service, { name: 'Vacía' });
    expect((await service.remove(empty.id)).ok).toBe(true);
  });

  it('un nombre repetido vuelve como error de campo', async () => {
    const { service } = await fresh();
    await crear(service);
    const dup = await service.create(draft({ name: '  bbva ' }));
    expect(!dup.ok && Array.isArray(dup.error) && dup.error[0]?.field).toBe('name');
  });

  it('conciliar con ajuste deja la cuenta cuadrada; sin ajuste solo lo anota', async () => {
    const { repos, service } = await fresh();
    const bbva = await crear(service);
    await repos.events.insert(movimiento(bbva.id));
    const day = isoDate(2026, 9, 15);

    const noted = await service.reconcile(bbva.id, day, money(140_000), false);
    expect(noted.ok && noted.value.adjustmentCents).toBe(0);
    const unchanged = await service.balanceOf(bbva, day);
    expect(unchanged.ok && unchanged.value).toBe(142_759);

    const adjusted = await service.reconcile(bbva.id, day, money(140_000), true);
    expect(adjusted.ok && adjusted.value.adjustmentCents).toBe(-2_759);
    const squared = await service.balanceOf(bbva, day);
    expect(squared.ok && squared.value).toBe(140_000);

    const earlier = await service.reconcile(bbva.id, isoDate(2026, 9, 10), money(0), true);
    expect(!earlier.ok && Array.isArray(earlier.error) && earlier.error[0]?.field).toBe('date');
  });

  it('el panel de conciliación lista desde la última conciliación con el saldo de partida correcto', async () => {
    const { repos, service } = await fresh();
    const bbva = await crear(service);
    const ahorro = await crear(service, { name: 'Ahorro', kind: 'savings', openingBalanceCents: money(0) });
    await repos.events.insert(movimiento(bbva.id, { date: isoDate(2026, 9, 3) }));
    await service.reconcile(bbva.id, isoDate(2026, 9, 5), money(142_000), true);
    await repos.events.insert(movimiento(bbva.id, { date: isoDate(2026, 9, 20), type: 'income', categoryId: null, nature: null, amountCents: money(10_000), concept: 'Nómina', meta: { type: 'income' } }));
    await service.createTransfer({ fromAccountId: bbva.id, toAccountId: ahorro.id, amountCents: money(20_000), date: isoDate(2026, 9, 21), concept: null });

    const view = await service.reconciliationView(bbva.id, isoDate(2026, 9, 30));
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.range).toEqual({ from: isoDate(2026, 9, 6), to: isoDate(2026, 9, 30) });
    expect(view.value.startingBalance).toBe(142_000);
    expect(view.value.ledger.map((l) => [l.concept, l.balanceCents])).toEqual([
      ['Nómina', 152_000],
      ['Traspaso a Ahorro', 132_000],
    ]);
    expect(view.value.balance).toBe(132_000);
    expect(view.value.history.length).toBe(1);
  });
});
