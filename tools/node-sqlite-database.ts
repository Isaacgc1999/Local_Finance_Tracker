import { DatabaseSync } from 'node:sqlite';

import { dbError, messageOf } from '../src/app/core/errors/app-error';
import { type Result, err, ok, tryCatchSync } from '../src/app/core/types/result';
import type {
  DatabaseHandle,
  SqlStatement,
  SqlValue,
  TransactionOutcome,
} from '../src/app/data/db/database';

/**
 * Implementación de `DatabaseHandle` sobre `node:sqlite` para tests y
 * scripts (siembra, benchmark). No forma parte de la app.
 */
export class NodeSqliteDatabase implements DatabaseHandle {
  private constructor(
    private readonly db: DatabaseSync,
    readonly path: string,
  ) {}

  static open(path = ':memory:'): NodeSqliteDatabase {
    const db = new DatabaseSync(path);
    try {
      db.exec('PRAGMA foreign_keys = ON');
      if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
    } catch (cause) {
      // Si el fichero no es SQLite el PRAGMA falla, pero el descriptor ya
      // está abierto: cerrarlo antes de propagar deja el fichero libre.
      db.close();
      throw cause;
    }
    return new NodeSqliteDatabase(db, path);
  }

  async select<Row extends object>(sql: string, params: readonly SqlValue[] = []): Promise<Result<readonly Row[]>> {
    return tryCatchSync(() => this.db.prepare(sql).all(...params) as unknown as Row[]);
  }

  async transaction(statements: readonly SqlStatement[]): Promise<Result<TransactionOutcome>> {
    try {
      this.db.exec('BEGIN IMMEDIATE');
    } catch (cause) {
      return err(dbError(messageOf(cause), cause));
    }
    let rowsAffected = 0;
    try {
      for (const s of statements) {
        const outcome = this.db.prepare(s.sql).run(...(s.params ?? []));
        rowsAffected += Number(outcome.changes);
      }
      this.db.exec('COMMIT');
      return ok({ rowsAffected });
    } catch (cause) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // la transacción ya no existe; nada que deshacer
      }
      return err(dbError(messageOf(cause), cause));
    }
  }

  async executeRaw(sql: string, params: readonly SqlValue[] = []): Promise<Result<TransactionOutcome>> {
    return tryCatchSync(() => ({ rowsAffected: Number(this.db.prepare(sql).run(...params).changes) }));
  }

  async close(): Promise<Result<void>> {
    return tryCatchSync(() => this.db.close());
  }
}
