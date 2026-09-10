import { dbError } from '../../core/errors/app-error';
import { nowIsoTimestamp } from '../../core/types/iso-date';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, type SqlStatement, stmt } from './database';

export interface Migration {
  readonly version: number;
  readonly name: string;
  /** Sentencias independientes; se ejecutan en orden dentro de una única transacción. */
  readonly statements: readonly string[];
}

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT    NOT NULL
)`;

interface VersionRow {
  readonly version: number;
}

/**
 * Aplica las migraciones pendientes en orden, cada una en su propia
 * transacción junto con su fila en `schema_migrations`. Idempotente: volver a
 * ejecutarla con la BD al día no hace nada.
 */
export async function applyPendingMigrations(
  db: DatabaseHandle,
  migrations: readonly Migration[],
): Promise<Result<{ readonly applied: readonly number[]; readonly current: number }>> {
  const versions = migrations.map((m) => m.version);
  if (new Set(versions).size !== versions.length) {
    return err(dbError('Migraciones con versión duplicada.'));
  }

  const ensured = await db.transaction([stmt(CREATE_MIGRATIONS_TABLE)]);
  if (!ensured.ok) return ensured;

  const appliedRows = await db.select<VersionRow>('SELECT version FROM schema_migrations');
  if (!appliedRows.ok) return appliedRows;
  const done = new Set(appliedRows.value.map((r) => r.version));

  const pending = [...migrations].sort((a, b) => a.version - b.version).filter((m) => !done.has(m.version));
  const applied: number[] = [];

  for (const migration of pending) {
    const statements: SqlStatement[] = [
      ...migration.statements.map((sql) => stmt(sql)),
      stmt('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', migration.version, nowIsoTimestamp()),
    ];
    const result = await db.transaction(statements);
    if (!result.ok) {
      return err(
        dbError(`Falló la migración ${migration.version} (${migration.name}): ${result.error.kind === 'db' ? result.error.message : ''}`, result.error),
      );
    }
    applied.push(migration.version);
  }

  const current = Math.max(0, ...done, ...applied);
  return ok({ applied, current });
}
