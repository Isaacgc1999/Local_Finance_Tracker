import type { Result } from '../../core/types/result';

/** Valores que admite SQLite por parámetro. Los JSON y los booleanos se serializan antes. */
export type SqlValue = string | number | null;

export interface SqlStatement {
  readonly sql: string;
  readonly params?: readonly SqlValue[];
}

export interface TransactionOutcome {
  readonly rowsAffected: number;
}

/**
 * Contrato de la base de datos que ven los repositorios. Dos implementaciones:
 * `TauriDatabase` (plugin-sql + comando `db_transaction`) en la app y
 * `NodeSqliteDatabase` (node:sqlite) en tests y scripts.
 *
 * Toda escritura pasa por `transaction()`: atómica, en una única conexión,
 * con `BEGIN IMMEDIATE … COMMIT` y `ROLLBACK` ante cualquier error.
 */
export interface DatabaseHandle {
  readonly path: string;
  select<Row extends object>(sql: string, params?: readonly SqlValue[]): Promise<Result<readonly Row[]>>;
  transaction(statements: readonly SqlStatement[]): Promise<Result<TransactionOutcome>>;
  /** Solo para PRAGMA y mantenimiento que SQLite no admite dentro de una transacción. */
  executeRaw(sql: string, params?: readonly SqlValue[]): Promise<Result<TransactionOutcome>>;
  close(): Promise<Result<void>>;
}

export function stmt(sql: string, ...params: readonly SqlValue[]): SqlStatement {
  return params.length ? { sql, params } : { sql };
}

/** `?, ?, ?` para cláusulas IN. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
