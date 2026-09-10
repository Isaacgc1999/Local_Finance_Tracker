import type { Database as SqlJsDb, SqlValue as SqlJsValue } from 'sql.js';

import { dbError, messageOf } from '../../core/errors/app-error';
import { type Result, err, ok, tryCatch, tryCatchSync } from '../../core/types/result';
import type { DatabaseHandle, SqlStatement, SqlValue, TransactionOutcome } from './database';

/**
 * SOLO DESARROLLO. SQLite compilado a WebAssembly (sql.js) en memoria para
 * poder ver la app con `ng serve` en un navegador, donde no existe Tauri.
 * Mismo SQL, mismas migraciones; los datos se pierden al recargar.
 * En producción `FT_BROWSER_DEMO` es `false` y este módulo nunca se carga.
 */
export class SqlJsDatabase implements DatabaseHandle {
  readonly path = 'memoria (demo en navegador)';

  private constructor(private readonly db: SqlJsDb) {}

  static async open(): Promise<Result<SqlJsDatabase>> {
    return tryCatch(
      async () => {
        const { default: initSqlJs } = await import('sql.js');
        const SQL = await initSqlJs({
          // Ruta absoluta respecto a <base href>: desde /events/new una ruta relativa fallaría.
          locateFile: (file: string) => new URL(`assets/sqljs/${file}`, document.baseURI).toString(),
        });
        const db = new SQL.Database();
        db.run('PRAGMA foreign_keys = ON');
        return new SqlJsDatabase(db);
      },
      (cause) => dbError(`No se pudo iniciar SQLite en el navegador: ${messageOf(cause)}`, cause),
    );
  }

  async select<Row extends object>(sql: string, params: readonly SqlValue[] = []): Promise<Result<readonly Row[]>> {
    return tryCatchSync(() => {
      const stmt = this.db.prepare(sql);
      try {
        stmt.bind([...params] as SqlJsValue[]);
        const rows: Row[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as Row);
        return rows;
      } finally {
        stmt.free();
      }
    });
  }

  async transaction(statements: readonly SqlStatement[]): Promise<Result<TransactionOutcome>> {
    try {
      this.db.run('BEGIN IMMEDIATE');
    } catch (cause) {
      return err(dbError(messageOf(cause), cause));
    }
    let rowsAffected = 0;
    try {
      for (const s of statements) {
        this.db.run(s.sql, [...(s.params ?? [])] as SqlJsValue[]);
        rowsAffected += this.db.getRowsModified();
      }
      this.db.run('COMMIT');
      return ok({ rowsAffected });
    } catch (cause) {
      try {
        this.db.run('ROLLBACK');
      } catch {
        // sin transacción activa
      }
      return err(dbError(messageOf(cause), cause));
    }
  }

  async executeRaw(sql: string, params: readonly SqlValue[] = []): Promise<Result<TransactionOutcome>> {
    return tryCatchSync(() => {
      this.db.run(sql, [...params] as SqlJsValue[]);
      return { rowsAffected: this.db.getRowsModified() };
    });
  }

  async close(): Promise<Result<void>> {
    return tryCatchSync(() => this.db.close());
  }
}
