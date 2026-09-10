import { notFound, validationError } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import { type Budget, type BudgetScope, isBudgetScope } from '../../core/types/budget';
import { nowIsoTimestamp } from '../../core/types/iso-date';
import { type Money, money } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, stmt } from '../db/database';

interface BudgetRow {
  readonly id: string;
  readonly scope: string;
  readonly amount_cents: number;
  readonly created_at: string;
  readonly updated_at: string;
}

function rowToBudget(row: BudgetRow): Budget | null {
  if (!isBudgetScope(row.scope) || !Number.isSafeInteger(row.amount_cents)) return null;
  return {
    id: row.id,
    scope: row.scope,
    amountCents: money(row.amount_cents),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Un presupuesto por ámbito (`scope` es UNIQUE): guardar uno existente lo actualiza. */
export class BudgetsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  async findAll(): Promise<Result<readonly Budget[]>> {
    const rows = await this.db.select<BudgetRow>(
      'SELECT id, scope, amount_cents, created_at, updated_at FROM budgets ORDER BY created_at, scope',
    );
    if (!rows.ok) return rows;
    // Un ámbito que ya no se reconoce (p. ej. de una versión futura) se ignora en vez de romper la carga.
    return ok(rows.value.map(rowToBudget).filter((b): b is Budget => b !== null));
  }

  async save(scope: BudgetScope, amountCents: Money): Promise<Result<Budget>> {
    if (!isBudgetScope(scope)) return err(validationError('scope', 'Tipo de presupuesto no válido.'));
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      return err(validationError('amount', 'El importe tiene que ser mayor que cero.'));
    }
    const now = nowIsoTimestamp();
    const id = uuidV7();
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO budgets (id, scope, amount_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(scope) DO UPDATE SET amount_cents = excluded.amount_cents, updated_at = excluded.updated_at`,
        id,
        scope,
        amountCents,
        now,
        now,
      ),
    ]);
    if (!result.ok) return result;
    const rows = await this.db.select<BudgetRow>(
      'SELECT id, scope, amount_cents, created_at, updated_at FROM budgets WHERE scope = ?',
      [scope],
    );
    if (!rows.ok) return rows;
    const saved = rows.value[0] ? rowToBudget(rows.value[0]) : null;
    return saved ? ok(saved) : err(notFound('el presupuesto', scope));
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM budgets WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('el presupuesto', id)) : ok(undefined);
  }
}
