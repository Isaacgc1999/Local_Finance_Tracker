import { dbError, notFound } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import type { Transfer, TransferDraft, TransferPatch } from '../../core/types/account';
import { type DateRange, isIsoDate, nowIsoTimestamp } from '../../core/types/iso-date';
import { tryMoney } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, type SqlValue, stmt } from '../db/database';
import { mapRows } from '../mappers/json';

interface TransferRow {
  readonly id: string;
  readonly from_account_id: string;
  readonly to_account_id: string;
  readonly amount_cents: number;
  readonly date: string;
  readonly concept: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

const TRANSFER_COLUMNS = 'id, from_account_id, to_account_id, amount_cents, date, concept, created_at, updated_at';

function rowToTransfer(row: TransferRow): Result<Transfer> {
  if (!isIsoDate(row.date)) return err(dbError(`Fecha inválida en transfers.${row.id}: ${row.date}`));
  const amount = tryMoney(row.amount_cents, 'amount_cents');
  if (!amount.ok) return amount;
  return ok({
    id: row.id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    amountCents: amount.value,
    date: row.date,
    concept: row.concept,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const PATCH_COLUMNS: Readonly<Record<keyof TransferPatch, string>> = {
  fromAccountId: 'from_account_id',
  toAccountId: 'to_account_id',
  amountCents: 'amount_cents',
  date: 'date',
  concept: 'concept',
};

export class TransfersRepository {
  constructor(private readonly db: DatabaseHandle) {}

  async findById(id: string): Promise<Result<Transfer | null>> {
    const rows = await this.db.select<TransferRow>(`SELECT ${TRANSFER_COLUMNS} FROM transfers WHERE id = ?`, [id]);
    if (!rows.ok) return rows;
    const row = rows.value[0];
    return row ? rowToTransfer(row) : ok(null);
  }

  async findRecent(limit: number): Promise<Result<readonly Transfer[]>> {
    const rows = await this.db.select<TransferRow>(
      `SELECT ${TRANSFER_COLUMNS} FROM transfers ORDER BY date DESC, created_at DESC LIMIT ?`,
      [limit],
    );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToTransfer);
  }

  /** Traspasos que entran o salen de una cuenta dentro del rango, del más antiguo al más reciente. */
  async findForAccount(accountId: string, range: DateRange): Promise<Result<readonly Transfer[]>> {
    const rows = await this.db.select<TransferRow>(
      `SELECT ${TRANSFER_COLUMNS} FROM transfers
       WHERE (from_account_id = ? OR to_account_id = ?) AND date BETWEEN ? AND ?
       ORDER BY date, created_at`,
      [accountId, accountId, range.from, range.to],
    );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToTransfer);
  }

  async insert(draft: TransferDraft, id: string = uuidV7()): Promise<Result<Transfer>> {
    const now = nowIsoTimestamp();
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO transfers (${TRANSFER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        draft.fromAccountId,
        draft.toAccountId,
        draft.amountCents,
        draft.date,
        draft.concept,
        now,
        now,
      ),
    ]);
    if (!result.ok) return result;
    return ok({ ...draft, id, createdAt: now, updatedAt: now });
  }

  async update(id: string, patch: TransferPatch): Promise<Result<Transfer>> {
    const sets: string[] = [];
    const params: SqlValue[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as (keyof TransferPatch)[]) {
      if (!(key in patch)) continue;
      sets.push(`${PATCH_COLUMNS[key]} = ?`);
      params.push(patch[key] as SqlValue);
    }
    const now = nowIsoTimestamp();
    sets.push('updated_at = ?');
    params.push(now, id);
    const result = await this.db.transaction([stmt(`UPDATE transfers SET ${sets.join(', ')} WHERE id = ?`, ...params)]);
    if (!result.ok) return result;
    if (result.value.rowsAffected === 0) return err(notFound('el traspaso', id));
    const updated = await this.findById(id);
    if (!updated.ok) return updated;
    return updated.value ? ok(updated.value) : err(notFound('el traspaso', id));
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM transfers WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('el traspaso', id)) : ok(undefined);
  }
}
