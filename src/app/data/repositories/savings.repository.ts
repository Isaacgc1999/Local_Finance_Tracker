import { dbError, notFound } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import { isIsoDate, nowIsoTimestamp } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import {
  type PotEntry,
  type PotEntryDraft,
  type SavingsPot,
  type SavingsPotDraft,
  type SavingsPotPatch,
  isPotKind,
} from '../../core/types/savings';
import { type DatabaseHandle, type SqlValue, stmt } from '../db/database';
import { mapRows } from '../mappers/json';

interface PotRow {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly color: string;
  readonly target_cents: number | null;
  readonly goal_id: string | null;
  readonly archived: number;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface EntryRow {
  readonly id: string;
  readonly pot_id: string;
  readonly date: string;
  readonly amount_cents: number;
  readonly note: string | null;
  readonly created_at: string;
}

const POT_COLUMNS = 'id, name, kind, color, target_cents, goal_id, archived, sort_order, created_at, updated_at';
const ENTRY_COLUMNS = 'id, pot_id, date, amount_cents, note, created_at';

function rowToPot(row: PotRow): Result<SavingsPot> {
  if (!isPotKind(row.kind)) return err(dbError(`Tipo de hucha desconocido: ${row.kind}`));
  return ok({
    id: row.id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    targetCents: row.target_cents === null ? null : money(row.target_cents),
    goalId: row.goal_id,
    archived: row.archived === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function rowToEntry(row: EntryRow): Result<PotEntry> {
  if (!isIsoDate(row.date)) return err(dbError(`Fecha inválida en pot_entries.${row.id}`));
  return ok({
    id: row.id,
    potId: row.pot_id,
    date: row.date,
    amountCents: money(row.amount_cents),
    note: row.note,
    createdAt: row.created_at,
  });
}

/** Huchas de ahorro y sus apuntes (aportaciones y retiradas a mano). */
export class SavingsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  async findPots(): Promise<Result<readonly SavingsPot[]>> {
    const rows = await this.db.select<PotRow>(`SELECT ${POT_COLUMNS} FROM savings_pots ORDER BY sort_order, created_at`);
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToPot);
  }

  async findEntries(): Promise<Result<readonly PotEntry[]>> {
    const rows = await this.db.select<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM pot_entries ORDER BY date, created_at`);
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToEntry);
  }

  async insertPot(draft: SavingsPotDraft): Promise<Result<SavingsPot>> {
    const now = nowIsoTimestamp();
    const id = uuidV7();
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO savings_pots (${POT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        draft.name.trim(),
        draft.kind,
        draft.color,
        draft.targetCents,
        draft.goalId,
        draft.archived ? 1 : 0,
        draft.sortOrder,
        now,
        now,
      ),
    ]);
    if (!result.ok) return result;
    return ok({ ...draft, name: draft.name.trim(), id, createdAt: now, updatedAt: now });
  }

  async updatePot(id: string, patch: SavingsPotPatch): Promise<Result<void>> {
    const sets: string[] = [];
    const params: SqlValue[] = [];
    if (patch.name !== undefined) {
      sets.push('name = ?');
      params.push(patch.name.trim());
    }
    if (patch.color !== undefined) {
      sets.push('color = ?');
      params.push(patch.color);
    }
    if (patch.targetCents !== undefined) {
      sets.push('target_cents = ?');
      params.push(patch.targetCents);
    }
    if (patch.archived !== undefined) {
      sets.push('archived = ?');
      params.push(patch.archived ? 1 : 0);
    }
    if (patch.sortOrder !== undefined) {
      sets.push('sort_order = ?');
      params.push(patch.sortOrder);
    }
    sets.push('updated_at = ?');
    params.push(nowIsoTimestamp(), id);
    const result = await this.db.transaction([stmt(`UPDATE savings_pots SET ${sets.join(', ')} WHERE id = ?`, ...params)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('la hucha', id)) : ok(undefined);
  }

  /** Borra una hucha que no es de un objetivo; sus apuntes se van con ella. */
  async deletePot(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt(`DELETE FROM savings_pots WHERE id = ? AND goal_id IS NULL`, id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('la hucha', id)) : ok(undefined);
  }

  async insertEntry(draft: PotEntryDraft): Promise<Result<PotEntry>> {
    const now = nowIsoTimestamp();
    const id = uuidV7();
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO pot_entries (${ENTRY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        draft.potId,
        draft.date,
        draft.amountCents,
        draft.note,
        now,
      ),
    ]);
    if (!result.ok) return result;
    return ok({ ...draft, id, createdAt: now });
  }

  async deleteEntry(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM pot_entries WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('el apunte', id)) : ok(undefined);
  }
}
