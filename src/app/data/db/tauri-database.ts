import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';

import { dbError, messageOf } from '../../core/errors/app-error';
import { type Result, ok, tryCatch } from '../../core/types/result';
import type { DatabaseHandle, SqlStatement, SqlValue, TransactionOutcome } from './database';

interface TxOutcomeDto {
  readonly rows_affected: number;
}

/**
 * SQLite a través de `@tauri-apps/plugin-sql`. Las lecturas usan el plugin;
 * las escrituras van al comando Rust `db_transaction`, que toma UNA conexión
 * del pool del propio plugin y ejecuta todas las sentencias entre
 * `BEGIN IMMEDIATE` y `COMMIT` (el pool de sqlx no garantiza que dos
 * `execute()` consecutivos caigan en la misma conexión).
 */
export class TauriDatabase implements DatabaseHandle {
  private constructor(
    private readonly db: Database,
    readonly path: string,
    /** Clave con la que el plugin registra la instancia (`sqlite:<ruta absoluta>`). */
    private readonly key: string,
  ) {}

  static async open(absolutePath: string): Promise<Result<TauriDatabase>> {
    const key = `sqlite:${absolutePath}`;
    const loaded = await tryCatch(
      () => Database.load(key),
      (cause) => dbError(`No se pudo abrir ${absolutePath}: ${messageOf(cause)}`, cause),
    );
    if (!loaded.ok) return loaded;
    const handle = new TauriDatabase(loaded.value, absolutePath, key);
    // WAL es persistente en el fichero; foreign_keys ya viene activado por sqlx en cada conexión.
    const wal = await handle.select<{ journal_mode: string }>('PRAGMA journal_mode = WAL');
    if (!wal.ok) return wal;
    return ok(handle);
  }

  select<Row extends object>(sql: string, params: readonly SqlValue[] = []): Promise<Result<readonly Row[]>> {
    return tryCatch(() => this.db.select<Row[]>(sql, [...params]));
  }

  async transaction(statements: readonly SqlStatement[]): Promise<Result<TransactionOutcome>> {
    const result = await tryCatch(() =>
      invoke<TxOutcomeDto>('db_transaction', {
        db: this.key,
        statements: statements.map((s) => ({ sql: s.sql, params: [...(s.params ?? [])] })),
      }),
    );
    if (!result.ok) return result;
    return ok({ rowsAffected: result.value.rows_affected });
  }

  async executeRaw(sql: string, params: readonly SqlValue[] = []): Promise<Result<TransactionOutcome>> {
    const result = await tryCatch(() => this.db.execute(sql, [...params]));
    if (!result.ok) return result;
    return ok({ rowsAffected: result.value.rowsAffected });
  }

  async close(): Promise<Result<void>> {
    const result = await tryCatch(() => this.db.close());
    return result.ok ? ok(undefined) : result;
  }
}
