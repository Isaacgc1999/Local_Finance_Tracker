import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeSqliteDatabase } from '../../../../tools/node-sqlite-database';
import { money } from '../../core/types/money';
import { backupFileName, inspectBackup, vacuumInto } from './backup';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';
import { applyPendingMigrations } from './migrator';
import { stmt } from './database';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fintrack-backup-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Base de datos migrada con `n` movimientos, en un fichero real del disco. */
async function seedDatabase(fileName: string, events: number): Promise<NodeSqliteDatabase> {
  const db = NodeSqliteDatabase.open(join(dir, fileName));
  const migrated = await applyPendingMigrations(db, MIGRATIONS);
  expect(migrated.ok).toBe(true);
  const rows = Array.from({ length: events }, (_, i) =>
    stmt(
      `INSERT INTO events (id, type, amount_cents, date, concept, category_id, nature, payment_method, notes, meta, recurrence_id, attachment_path, created_at, updated_at)
       VALUES (?, 'expense', ?, '2026-09-01', ?, NULL, 'variable', NULL, NULL, NULL, NULL, NULL, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`,
      `evt-${i}`,
      money(1000 + i),
      `Movimiento ${i}`,
    ),
  );
  const inserted = await db.transaction(rows);
  expect(inserted.ok).toBe(true);
  return db;
}

describe('copia de seguridad (SQLite real)', () => {
  it('el nombre del fichero lleva la fecha', () => {
    expect(backupFileName(new Date(2026, 8, 10))).toBe('fintrack-backup-2026-09-10.db');
    expect(backupFileName(new Date(2026, 0, 5))).toBe('fintrack-backup-2026-01-05.db');
  });

  it('VACUUM INTO copia la base de datos abierta y la copia se puede abrir', async () => {
    const db = await seedDatabase('origen.db', 12);
    const target = join(dir, 'copia.db');

    const copied = await vacuumInto(db, target);
    expect(copied.ok).toBe(true);
    expect(statSync(target).size).toBeGreaterThan(0);

    // La copia es una base de datos completa, no un fragmento.
    const copia = NodeSqliteDatabase.open(target);
    const summary = await inspectBackup(copia, LATEST_SCHEMA_VERSION);
    expect(summary.ok && summary.value.events).toBe(12);
    expect(summary.ok && summary.value.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    await copia.close();
    await db.close();
  });

  it('el original sigue usable después de copiarlo', async () => {
    const db = await seedDatabase('origen.db', 3);
    const copied = await vacuumInto(db, join(dir, 'copia.db'));
    expect(copied.ok).toBe(true);

    const after = await db.select<{ n: number }>('SELECT COUNT(*) AS n FROM events');
    expect(after.ok && after.value[0]?.n).toBe(3);
    await db.close();
  });

  it('no sobrescribe un destino que ya existe', async () => {
    const db = await seedDatabase('origen.db', 1);
    const target = join(dir, 'ocupado.db');
    writeFileSync(target, 'no soy una base de datos');

    const copied = await vacuumInto(db, target);
    expect(copied.ok).toBe(false);
    await db.close();
  });
});

describe('validación de la copia antes de restaurar', () => {
  it('un fichero que no es SQLite ni siquiera se puede abrir', () => {
    const target = join(dir, 'basura.db');
    writeFileSync(target, 'esto es un txt con otra extensión');
    // SQLite lo rechaza al abrirlo, antes de llegar a la validación; en la
    // aplicación eso es un `Result` de error de `TauriDatabase.open`.
    expect(() => NodeSqliteDatabase.open(target)).toThrow(/not a database/i);
  });

  it('rechaza una base de datos SQLite que no es de Fintrack', async () => {
    const db = NodeSqliteDatabase.open(join(dir, 'otra.db'));
    await db.executeRaw('CREATE TABLE cosas (id INTEGER PRIMARY KEY)');
    const summary = await inspectBackup(db, LATEST_SCHEMA_VERSION);
    expect(summary.ok).toBe(false);
    if (!summary.ok) expect(summary.error.kind).toBe('validation');
    await db.close();
  });

  it('rechaza una copia de una versión más nueva de la aplicación', async () => {
    const db = await seedDatabase('futura.db', 2);
    await db.transaction([
      stmt('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', 99, '2030-01-01T00:00:00Z'),
    ]);
    const summary = await inspectBackup(db, LATEST_SCHEMA_VERSION);
    expect(summary.ok).toBe(false);
    if (!summary.ok && summary.error.kind === 'validation') {
      expect(summary.error.message).toContain('esquema 99');
    }
    await db.close();
  });

  it('acepta una copia de una versión anterior (las migraciones la pondrán al día)', async () => {
    const db = NodeSqliteDatabase.open(join(dir, 'antigua.db'));
    const soloPrimera = MIGRATIONS.filter((m) => m.version === 1);
    await applyPendingMigrations(db, soloPrimera);
    const summary = await inspectBackup(db, LATEST_SCHEMA_VERSION);
    expect(summary.ok && summary.value.schemaVersion).toBe(1);
    await db.close();
  });
});
