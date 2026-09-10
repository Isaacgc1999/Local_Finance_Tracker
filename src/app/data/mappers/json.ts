import { dbError } from '../../core/errors/app-error';
import { type Result, err, ok } from '../../core/types/result';

/** Parsea una columna JSON de SQLite; `null`/'' → `null`. */
export function parseJsonColumn<T>(raw: string | null | undefined, column: string): Result<T | null> {
  if (raw === null || raw === undefined || raw === '') return ok(null);
  try {
    return ok(JSON.parse(raw) as T);
  } catch (cause) {
    return err(dbError(`Columna ${column} con JSON inválido.`, cause));
  }
}

export function toJsonColumn(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/** Aplica un mapper fila a fila cortando en el primer error. */
export function mapRows<Row, T>(rows: readonly Row[], mapper: (row: Row) => Result<T>): Result<T[]> {
  const out: T[] = [];
  for (const row of rows) {
    const r = mapper(row);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}
