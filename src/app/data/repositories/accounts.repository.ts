import { dbError, notFound } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import { type Account, type AccountDraft, type AccountPatch, isAccountKind } from '../../core/types/account';
import type { EventType } from '../../core/types/event';
import { type IsoDate, isIsoDate, nowIsoTimestamp } from '../../core/types/iso-date';
import { tryMoney } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, type SqlValue, stmt } from '../db/database';
import { mapRows } from '../mappers/json';

interface AccountRow {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly color: string;
  readonly opening_balance_cents: number;
  readonly opening_date: string;
  readonly archived: number;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

const ACCOUNT_COLUMNS =
  'id, name, kind, color, opening_balance_cents, opening_date, archived, sort_order, created_at, updated_at';

function rowToAccount(row: AccountRow): Result<Account> {
  if (!isAccountKind(row.kind)) return err(dbError(`Tipo de cuenta desconocido: ${row.kind}`));
  if (!isIsoDate(row.opening_date)) return err(dbError(`opening_date inválida en accounts.${row.id}`));
  const opening = tryMoney(row.opening_balance_cents, 'opening_balance_cents');
  if (!opening.ok) return opening;
  return ok({
    id: row.id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    openingBalanceCents: opening.value,
    openingDate: row.opening_date,
    archived: row.archived === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const PATCH_COLUMNS: Readonly<Record<keyof AccountPatch, string>> = {
  name: 'name',
  kind: 'kind',
  color: 'color',
  openingBalanceCents: 'opening_balance_cents',
  openingDate: 'opening_date',
  archived: 'archived',
  sortOrder: 'sort_order',
};

/**
 * Todo lo que mueve el saldo de una cuenta hasta una fecha, sin interpretar:
 * el signo de cada tipo de movimiento lo pone el dominio (`balanceSign`).
 * Solo cuenta lo fechado desde la apertura de la cuenta.
 */
export interface AccountFlows {
  readonly eventsByType: ReadonlyMap<EventType, number>;
  readonly transfersIn: number;
  readonly transfersOut: number;
  readonly adjustments: number;
}

export const EMPTY_FLOWS: AccountFlows = { eventsByType: new Map(), transfersIn: 0, transfersOut: 0, adjustments: 0 };

interface FlowRow {
  readonly account_id: string;
  readonly total: number;
}

export class AccountsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  async findAll(): Promise<Result<readonly Account[]>> {
    const rows = await this.db.select<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM accounts ORDER BY archived, sort_order, name COLLATE NOCASE`,
    );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToAccount);
  }

  async findById(id: string): Promise<Result<Account | null>> {
    const rows = await this.db.select<AccountRow>(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`, [id]);
    if (!rows.ok) return rows;
    const row = rows.value[0];
    return row ? rowToAccount(row) : ok(null);
  }

  async insert(draft: AccountDraft, id: string = uuidV7()): Promise<Result<Account>> {
    const now = nowIsoTimestamp();
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO accounts (${ACCOUNT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        draft.name,
        draft.kind,
        draft.color,
        draft.openingBalanceCents,
        draft.openingDate,
        draft.archived ? 1 : 0,
        draft.sortOrder,
        now,
        now,
      ),
    ]);
    if (!result.ok) return result;
    return ok({ ...draft, id, createdAt: now, updatedAt: now });
  }

  async update(id: string, patch: AccountPatch): Promise<Result<Account>> {
    const sets: string[] = [];
    const params: SqlValue[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as (keyof AccountPatch)[]) {
      if (!(key in patch)) continue;
      const value = patch[key];
      sets.push(`${PATCH_COLUMNS[key]} = ?`);
      params.push(key === 'archived' ? (value ? 1 : 0) : (value as SqlValue));
    }
    const now = nowIsoTimestamp();
    sets.push('updated_at = ?');
    params.push(now, id);
    const result = await this.db.transaction([stmt(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, ...params)]);
    if (!result.ok) return result;
    if (result.value.rowsAffected === 0) return err(notFound('la cuenta', id));
    const updated = await this.findById(id);
    if (!updated.ok) return updated;
    return updated.value ? ok(updated.value) : err(notFound('la cuenta', id));
  }

  /** Borra la cuenta y sus conciliaciones; los movimientos quedan sin cuenta. Falla si tiene traspasos. */
  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM accounts WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('la cuenta', id)) : ok(undefined);
  }

  async nextSortOrder(): Promise<Result<number>> {
    const rows = await this.db.select<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM accounts');
    if (!rows.ok) return rows;
    return ok(rows.value[0]?.next ?? 0);
  }

  /** Movimientos y traspasos que apuntan a la cuenta (decide si se puede borrar o solo archivar). */
  async countUses(id: string): Promise<Result<number>> {
    const rows = await this.db.select<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM events WHERE account_id = ?)
            + (SELECT COUNT(*) FROM transfers WHERE from_account_id = ? OR to_account_id = ?) AS n`,
      [id, id, id],
    );
    if (!rows.ok) return rows;
    return ok(rows.value[0]?.n ?? 0);
  }

  /** Nº de movimientos sin cuenta: la pantalla de Cuentas avisa de que no suman en ningún saldo. */
  async countUnassignedEvents(): Promise<Result<number>> {
    const rows = await this.db.select<{ n: number }>('SELECT COUNT(*) AS n FROM events WHERE account_id IS NULL');
    if (!rows.ok) return rows;
    return ok(rows.value[0]?.n ?? 0);
  }

  /** Flujos de cada cuenta desde su apertura hasta `asOf` inclusive. Las cuentas sin flujos no aparecen. */
  async flowsUpTo(asOf: IsoDate): Promise<Result<ReadonlyMap<string, AccountFlows>>> {
    const [events, incoming, outgoing, adjustments] = await Promise.all([
      this.db.select<FlowRow & { type: EventType }>(
        `SELECT e.account_id AS account_id, e.type AS type, SUM(e.amount_cents) AS total
         FROM events e JOIN accounts a ON a.id = e.account_id
         WHERE e.date >= a.opening_date AND e.date <= ?
         GROUP BY e.account_id, e.type`,
        [asOf],
      ),
      this.db.select<FlowRow>(
        `SELECT t.to_account_id AS account_id, SUM(t.amount_cents) AS total
         FROM transfers t JOIN accounts a ON a.id = t.to_account_id
         WHERE t.date >= a.opening_date AND t.date <= ?
         GROUP BY t.to_account_id`,
        [asOf],
      ),
      this.db.select<FlowRow>(
        `SELECT t.from_account_id AS account_id, SUM(t.amount_cents) AS total
         FROM transfers t JOIN accounts a ON a.id = t.from_account_id
         WHERE t.date >= a.opening_date AND t.date <= ?
         GROUP BY t.from_account_id`,
        [asOf],
      ),
      this.db.select<FlowRow>(
        `SELECT account_id, SUM(adjustment_cents) AS total
         FROM reconciliations WHERE date <= ? GROUP BY account_id`,
        [asOf],
      ),
    ]);
    if (!events.ok) return events;
    if (!incoming.ok) return incoming;
    if (!outgoing.ok) return outgoing;
    if (!adjustments.ok) return adjustments;

    const byAccount = new Map<string, { eventsByType: Map<EventType, number>; transfersIn: number; transfersOut: number; adjustments: number }>();
    const entry = (id: string) => {
      let e = byAccount.get(id);
      if (!e) {
        e = { eventsByType: new Map(), transfersIn: 0, transfersOut: 0, adjustments: 0 };
        byAccount.set(id, e);
      }
      return e;
    };
    for (const r of events.value) entry(r.account_id).eventsByType.set(r.type, r.total);
    for (const r of incoming.value) entry(r.account_id).transfersIn = r.total;
    for (const r of outgoing.value) entry(r.account_id).transfersOut = r.total;
    for (const r of adjustments.value) entry(r.account_id).adjustments = r.total;
    return ok(byAccount);
  }
}
