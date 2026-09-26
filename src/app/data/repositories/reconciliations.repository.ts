import { dbError, notFound } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import type { Reconciliation, ReconciliationDraft } from '../../core/types/account';
import { isIsoDate, nowIsoTimestamp } from '../../core/types/iso-date';
import { tryMoney } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, stmt } from '../db/database';
import { mapRows } from '../mappers/json';

interface ReconciliationRow {
  readonly id: string;
  readonly account_id: string;
  readonly date: string;
  readonly statement_balance_cents: number;
  readonly adjustment_cents: number;
  readonly created_at: string;
}

const RECONCILIATION_COLUMNS = 'id, account_id, date, statement_balance_cents, adjustment_cents, created_at';

function rowToReconciliation(row: ReconciliationRow): Result<Reconciliation> {
  if (!isIsoDate(row.date)) return err(dbError(`Fecha inválida en reconciliations.${row.id}: ${row.date}`));
  const statement = tryMoney(row.statement_balance_cents, 'statement_balance_cents');
  if (!statement.ok) return statement;
  const adjustment = tryMoney(row.adjustment_cents, 'adjustment_cents');
  if (!adjustment.ok) return adjustment;
  return ok({
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    statementBalanceCents: statement.value,
    adjustmentCents: adjustment.value,
    createdAt: row.created_at,
  });
}

export class ReconciliationsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  /** Todas las conciliaciones, la más reciente primero (por fecha y, a igual fecha, por alta). */
  async findAll(): Promise<Result<readonly Reconciliation[]>> {
    const rows = await this.db.select<ReconciliationRow>(
      `SELECT ${RECONCILIATION_COLUMNS} FROM reconciliations ORDER BY date DESC, created_at DESC`,
    );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToReconciliation);
  }

  async findByAccount(accountId: string): Promise<Result<readonly Reconciliation[]>> {
    const rows = await this.db.select<ReconciliationRow>(
      `SELECT ${RECONCILIATION_COLUMNS} FROM reconciliations WHERE account_id = ? ORDER BY date DESC, created_at DESC`,
      [accountId],
    );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToReconciliation);
  }

  async insert(draft: ReconciliationDraft, id: string = uuidV7()): Promise<Result<Reconciliation>> {
    const now = nowIsoTimestamp();
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO reconciliations (${RECONCILIATION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        draft.accountId,
        draft.date,
        draft.statementBalanceCents,
        draft.adjustmentCents,
        now,
      ),
    ]);
    if (!result.ok) return result;
    return ok({ ...draft, id, createdAt: now });
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM reconciliations WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('la conciliación', id)) : ok(undefined);
  }
}
