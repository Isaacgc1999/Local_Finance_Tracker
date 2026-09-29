import { NodeSqliteDatabase } from '../../../../tools/node-sqlite-database';
import { SEED_CATEGORIES } from './migrations/0002-seed-categories';
import { MIGRATIONS } from './migrations';
import { type Migration, applyPendingMigrations } from './migrator';

describe('applyPendingMigrations (SQLite real)', () => {
  it('aplica el esquema y la semilla, y es idempotente', async () => {
    const db = NodeSqliteDatabase.open();
    const first = await applyPendingMigrations(db, MIGRATIONS);
    expect(first.ok && first.value.applied).toEqual([1, 2, 3, 4, 5, 6]);

    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.ok && tables.value.map((t) => t.name)).toEqual([
      'accounts',
      'ai_reports',
      'budgets',
      'categories',
      'category_rules',
      'events',
      'reconciliations',
      'recurrences',
      'schema_migrations',
      'settings',
      'transfers',
    ]);

    const cats = await db.select<{ n: number }>('SELECT COUNT(*) AS n FROM categories');
    expect(cats.ok && cats.value[0]?.n).toBe(SEED_CATEGORIES.length);

    const second = await applyPendingMigrations(db, MIGRATIONS);
    expect(second.ok && second.value.applied).toEqual([]);
    expect(second.ok && second.value.current).toBe(6);
  });

  it('la 0003 convierte el presupuesto antiguo solo si el usuario lo había cambiado', async () => {
    const hastaLa2 = MIGRATIONS.filter((m) => m.version <= 2);

    // Valor de ejemplo del handoff, sembrado a todo el mundo: no es un dato del usuario.
    const porDefecto = NodeSqliteDatabase.open();
    await applyPendingMigrations(porDefecto, hastaLa2);
    await applyPendingMigrations(porDefecto, MIGRATIONS);
    const ninguno = await porDefecto.select<{ n: number }>('SELECT COUNT(*) AS n FROM budgets');
    expect(ninguno.ok && ninguno.value[0]?.n).toBe(0);

    // Cambiado a mano: pasa a ser el límite de gasto total.
    const cambiado = NodeSqliteDatabase.open();
    await applyPendingMigrations(cambiado, hastaLa2);
    await cambiado.executeRaw("UPDATE settings SET value = '200000' WHERE key = 'budget_target_cents'");
    await applyPendingMigrations(cambiado, MIGRATIONS);
    const total = await cambiado.select<{ scope: string; amount_cents: number }>('SELECT scope, amount_cents FROM budgets');
    expect(total.ok && total.value).toEqual([{ scope: 'total', amount_cents: 200_000 }]);

    // La clave antigua desaparece en los dos casos.
    const clave = await cambiado.select<{ n: number }>("SELECT COUNT(*) AS n FROM settings WHERE key = 'budget_target_cents'");
    expect(clave.ok && clave.value[0]?.n).toBe(0);
  });

  const movimientoAntiguo = (id: string, date: string) =>
    `INSERT INTO events (id, type, amount_cents, date, concept, created_at, updated_at)
     VALUES ('${id}', 'expense', 1000, '${date}', 'Antes de las cuentas', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`;

  it('la 0004 deja los movimientos existentes sin cuenta y no inventa ninguna', async () => {
    const hastaLa4 = MIGRATIONS.filter((m) => m.version <= 4);
    const db = NodeSqliteDatabase.open();
    await applyPendingMigrations(db, MIGRATIONS.filter((m) => m.version <= 3));
    await db.executeRaw(movimientoAntiguo('e1', '2026-09-01'));
    const migrated = await applyPendingMigrations(db, hastaLa4);
    expect(migrated.ok && migrated.value.applied).toEqual([4]);

    const events = await db.select<{ account_id: string | null }>('SELECT account_id FROM events');
    expect(events.ok && events.value).toEqual([{ account_id: null }]);
    const accounts = await db.select<{ n: number }>('SELECT COUNT(*) AS n FROM accounts');
    expect(accounts.ok && accounts.value[0]?.n).toBe(0);
  });

  it('la 0006 pasa los movimientos y reglas sin cuenta a «Cuenta principal»', async () => {
    const db = NodeSqliteDatabase.open();
    await applyPendingMigrations(db, MIGRATIONS.filter((m) => m.version <= 5));
    await db.executeRaw(movimientoAntiguo('e1', '2026-03-15'));
    await db.executeRaw(movimientoAntiguo('e2', '2025-11-02'));
    await db.executeRaw(
      `INSERT INTO recurrences (id, type, amount_cents, concept, frequency, start_date, created_at, updated_at)
       VALUES ('r1', 'subscription', 1399, 'Netflix', 'monthly', '2026-01-14', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    );
    const migrated = await applyPendingMigrations(db, MIGRATIONS);
    expect(migrated.ok && migrated.value.applied).toEqual([6]);

    const accounts = await db.select<{ id: string; name: string; opening_date: string; opening_balance_cents: number; sort_order: number }>(
      'SELECT id, name, opening_date, opening_balance_cents, sort_order FROM accounts',
    );
    expect(accounts.ok && accounts.value).toEqual([
      { id: 'account-main', name: 'Cuenta principal', opening_date: '2000-01-01', opening_balance_cents: 0, sort_order: -1 },
    ]);
    const sinCuenta = await db.select<{ n: number }>(
      'SELECT (SELECT COUNT(*) FROM events WHERE account_id IS NULL) + (SELECT COUNT(*) FROM recurrences WHERE account_id IS NULL) AS n',
    );
    expect(sinCuenta.ok && sinCuenta.value[0]?.n).toBe(0);
  });

  it('la 0006 crea la cuenta vacía en una instalación nueva', async () => {
    const db = NodeSqliteDatabase.open();
    await applyPendingMigrations(db, MIGRATIONS);
    const accounts = await db.select<{ name: string; opening_date: string }>('SELECT name, opening_date FROM accounts');
    expect(accounts.ok && accounts.value.map((a) => a.name)).toEqual(['Cuenta principal']);
    expect(accounts.ok && accounts.value[0]?.opening_date).toBe('2000-01-01');
  });

  it('la 0006 reutiliza una cuenta que ya se llamara así', async () => {
    const db = NodeSqliteDatabase.open();
    await applyPendingMigrations(db, MIGRATIONS.filter((m) => m.version <= 5));
    await db.executeRaw(
      `INSERT INTO accounts (id, name, kind, color, opening_date, created_at, updated_at)
       VALUES ('mia', 'cuenta PRINCIPAL', 'bank', '#22C55E', '2026-01-01', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    );
    await db.executeRaw(movimientoAntiguo('e1', '2026-03-15'));
    await applyPendingMigrations(db, MIGRATIONS);
    const accounts = await db.select<{ id: string }>('SELECT id FROM accounts');
    expect(accounts.ok && accounts.value).toEqual([{ id: 'mia' }]);
    const events = await db.select<{ account_id: string }>('SELECT account_id FROM events');
    expect(events.ok && events.value).toEqual([{ account_id: 'mia' }]);
  });

  it('respeta lo que el usuario cambió en la semilla al reaplicar', async () => {
    const db = NodeSqliteDatabase.open();
    await applyPendingMigrations(db, MIGRATIONS);
    await db.transaction([{ sql: "UPDATE categories SET name = 'Casa' WHERE id = 'cat-hogar'" }]);
    // Simulamos una BD sin registro de la migración 2 (p. ej. restaurada de una copia antigua).
    await db.transaction([{ sql: 'DELETE FROM schema_migrations WHERE version = 2' }]);
    const again = await applyPendingMigrations(db, MIGRATIONS);
    expect(again.ok && again.value.applied).toEqual([2]);
    const row = await db.select<{ name: string }>("SELECT name FROM categories WHERE id = 'cat-hogar'");
    expect(row.ok && row.value[0]?.name).toBe('Casa');
  });

  it('una migración que falla no deja nada a medias', async () => {
    const db = NodeSqliteDatabase.open();
    const broken: Migration = {
      version: 1,
      name: 'rota',
      statements: ['CREATE TABLE ok_table (a INTEGER)', 'CREATE TABLE ( esto no es sql'],
    };
    const result = await applyPendingMigrations(db, [broken]);
    expect(result.ok).toBe(false);
    const tables = await db.select<{ name: string }>("SELECT name FROM sqlite_master WHERE name = 'ok_table'");
    expect(tables.ok && tables.value.length).toBe(0);
    const versions = await db.select<{ version: number }>('SELECT version FROM schema_migrations');
    expect(versions.ok && versions.value.length).toBe(0);
  });

  it('rechaza versiones duplicadas', async () => {
    const db = NodeSqliteDatabase.open();
    const dup: Migration = { version: 1, name: 'dup', statements: [] };
    const result = await applyPendingMigrations(db, [dup, dup]);
    expect(result.ok).toBe(false);
  });
});
