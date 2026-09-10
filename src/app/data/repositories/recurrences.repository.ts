import { notFound } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import type { EventType } from '../../core/types/event';
import { type IsoDate, addDays, nowIsoTimestamp } from '../../core/types/iso-date';
import type { Recurrence, RecurrenceDraft, RecurrencePatch } from '../../core/types/recurrence';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, type SqlValue, placeholders, stmt } from '../db/database';
import { mapRows, toJsonColumn } from '../mappers/json';
import {
  RECURRENCE_COLUMNS,
  type RecurrenceRow,
  recurrenceInsertParams,
  rowToRecurrence,
} from '../mappers/recurrence.mapper';

export interface RecurrenceQuery {
  readonly activeOnly?: boolean;
  readonly types?: readonly EventType[];
}

const PATCH_COLUMNS: Readonly<Record<keyof RecurrencePatch, string>> = {
  amountCents: 'amount_cents',
  categoryId: 'category_id',
  concept: 'concept',
  frequency: 'frequency',
  interval: 'interval',
  dayOfMonth: 'day_of_month',
  weekday: 'weekday',
  startDate: 'start_date',
  endDate: 'end_date',
  active: 'active',
  paymentMethod: 'payment_method',
  meta: 'meta',
};

export class RecurrencesRepository {
  constructor(private readonly db: DatabaseHandle) {}

  async findAll(query: RecurrenceQuery = {}): Promise<Result<readonly Recurrence[]>> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (query.activeOnly) where.push('active = 1');
    if (query.types && query.types.length > 0) {
      where.push(`type IN (${placeholders(query.types.length)})`);
      params.push(...query.types);
    }
    const rows = await this.db.select<RecurrenceRow>(
      `SELECT ${RECURRENCE_COLUMNS} FROM recurrences${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY start_date, concept`,
      params,
    );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToRecurrence);
  }

  async findById(id: string): Promise<Result<Recurrence | null>> {
    const rows = await this.db.select<RecurrenceRow>(`SELECT ${RECURRENCE_COLUMNS} FROM recurrences WHERE id = ?`, [id]);
    if (!rows.ok) return rows;
    const row = rows.value[0];
    return row ? rowToRecurrence(row) : ok(null);
  }

  async insert(draft: RecurrenceDraft, id: string = uuidV7()): Promise<Result<Recurrence>> {
    const now = nowIsoTimestamp();
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO recurrences (${RECURRENCE_COLUMNS}) VALUES (${placeholders(16)})`,
        ...recurrenceInsertParams(id, draft, now),
      ),
    ]);
    if (!result.ok) return result;
    return ok({ ...draft, id, createdAt: now, updatedAt: now });
  }

  async update(id: string, patch: RecurrencePatch): Promise<Result<Recurrence>> {
    const sets: string[] = [];
    const params: SqlValue[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as (keyof RecurrencePatch)[]) {
      if (!(key in patch)) continue;
      const value = patch[key];
      sets.push(`${PATCH_COLUMNS[key]} = ?`);
      if (key === 'meta') params.push(toJsonColumn(value));
      else if (key === 'active') params.push(value ? 1 : 0);
      else params.push(value as SqlValue);
    }
    const now = nowIsoTimestamp();
    sets.push('updated_at = ?');
    params.push(now, id);
    const result = await this.db.transaction([stmt(`UPDATE recurrences SET ${sets.join(', ')} WHERE id = ?`, ...params)]);
    if (!result.ok) return result;
    if (result.value.rowsAffected === 0) return err(notFound('la regla', id));
    const updated = await this.findById(id);
    if (!updated.ok) return updated;
    return updated.value ? ok(updated.value) : err(notFound('la regla', id));
  }

  /**
   * Desactivar a mitad de periodo: la regla deja de generar ocurrencias a
   * partir de `asOf` (end_date = día anterior). Las instancias ya
   * materializadas no se tocan. Reactivar borra la fecha de fin.
   */
  async setActive(id: string, active: boolean, asOf: IsoDate): Promise<Result<Recurrence>> {
    return active
      ? this.update(id, { active: true, endDate: null })
      : this.update(id, { active: false, endDate: addDays(asOf, -1) });
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM recurrences WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('la regla', id)) : ok(undefined);
  }
}
