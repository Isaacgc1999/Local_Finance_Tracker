import { notFound } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import type { Event, EventDraft, EventPatch, EventType } from '../../core/types/event';
import { type DateRange, type IsoDate, nowIsoTimestamp } from '../../core/types/iso-date';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, type SqlStatement, type SqlValue, placeholders, stmt } from '../db/database';
import { EVENT_COLUMNS, type EventRow, eventInsertParams, rowToEvent } from '../mappers/event.mapper';
import { mapRows, toJsonColumn } from '../mappers/json';

export interface EventQueryFilters {
  readonly types?: readonly EventType[];
  readonly categoryIds?: readonly string[];
  /** Búsqueda en concepto (sin distinguir mayúsculas). */
  readonly search?: string;
}

const INSERT_SQL = `INSERT INTO events (${EVENT_COLUMNS}) VALUES (${placeholders(14)})`;

/** Columnas editables y su nombre en SQL, para construir el UPDATE dinámico. */
const PATCH_COLUMNS: Readonly<Record<keyof EventPatch, string>> = {
  amountCents: 'amount_cents',
  date: 'date',
  concept: 'concept',
  categoryId: 'category_id',
  nature: 'nature',
  paymentMethod: 'payment_method',
  notes: 'notes',
  attachmentPath: 'attachment_path',
  recurrenceId: 'recurrence_id',
  meta: 'meta',
};

export class EventsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  async findById(id: string): Promise<Result<Event | null>> {
    const rows = await this.db.select<EventRow>(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = ?`, [id]);
    if (!rows.ok) return rows;
    const row = rows.value[0];
    if (!row) return ok(null);
    return rowToEvent(row);
  }

  async findInRange(range: DateRange, filters: EventQueryFilters = {}): Promise<Result<readonly Event[]>> {
    const where: string[] = ['date BETWEEN ? AND ?'];
    const params: SqlValue[] = [range.from, range.to];
    if (filters.types && filters.types.length > 0) {
      where.push(`type IN (${placeholders(filters.types.length)})`);
      params.push(...filters.types);
    }
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      where.push(`category_id IN (${placeholders(filters.categoryIds.length)})`);
      params.push(...filters.categoryIds);
    }
    const search = filters.search?.trim();
    if (search) {
      where.push('concept LIKE ? COLLATE NOCASE');
      params.push(`%${search.replace(/[%_]/g, '')}%`);
    }
    const rows = await this.db.select<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM events WHERE ${where.join(' AND ')} ORDER BY date DESC, created_at DESC`,
      params,
    );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToEvent);
  }

  async findRecent(limit: number): Promise<Result<readonly Event[]>> {
    const rows = await this.db.select<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM events ORDER BY date DESC, created_at DESC LIMIT ?`,
      [limit],
    );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToEvent);
  }

  /** Suma por tipo de todo lo anterior a una fecha (saldo inicial de un rango). */
  async sumByTypeBefore(date: IsoDate): Promise<Result<ReadonlyMap<EventType, number>>> {
    const rows = await this.db.select<{ type: EventType; total: number }>(
      'SELECT type, SUM(amount_cents) AS total FROM events WHERE date < ? GROUP BY type',
      [date],
    );
    if (!rows.ok) return rows;
    return ok(new Map(rows.value.map((r) => [r.type, r.total])));
  }

  async countAll(): Promise<Result<number>> {
    const rows = await this.db.select<{ n: number }>('SELECT COUNT(*) AS n FROM events');
    if (!rows.ok) return rows;
    return ok(rows.value[0]?.n ?? 0);
  }

  /** Nº de movimientos por categoría; los que no tienen categoría van bajo la clave `null`. */
  async countByCategory(): Promise<Result<ReadonlyMap<string | null, number>>> {
    const rows = await this.db.select<{ category_id: string | null; n: number }>(
      'SELECT category_id, COUNT(*) AS n FROM events GROUP BY category_id',
    );
    if (!rows.ok) return rows;
    return ok(new Map(rows.value.map((r) => [r.category_id, r.n])));
  }

  /** Fechas de una regla que ya son filas reales dentro del rango. */
  async materializedDates(recurrenceId: string, range: DateRange): Promise<Result<ReadonlySet<IsoDate>>> {
    const rows = await this.db.select<{ date: IsoDate }>(
      'SELECT date FROM events WHERE recurrence_id = ? AND date BETWEEN ? AND ?',
      [recurrenceId, range.from, range.to],
    );
    if (!rows.ok) return rows;
    return ok(new Set(rows.value.map((r) => r.date)));
  }

  async insert(draft: EventDraft, id: string = uuidV7()): Promise<Result<Event>> {
    const now = nowIsoTimestamp();
    const result = await this.db.transaction([stmt(INSERT_SQL, ...eventInsertParams(id, draft, now))]);
    if (!result.ok) return result;
    return ok({ ...draft, id, createdAt: now, updatedAt: now });
  }

  /**
   * Materialización idempotente: una regla solo puede tener una fila por
   * fecha (índice único parcial). Las ya existentes, editadas o no, se respetan.
   */
  async insertManyIfAbsent(
    drafts: readonly (EventDraft & { readonly recurrenceId: string })[],
  ): Promise<Result<{ readonly inserted: number }>> {
    if (drafts.length === 0) return ok({ inserted: 0 });
    const now = nowIsoTimestamp();
    const statements: SqlStatement[] = drafts.map((draft) =>
      stmt(
        `INSERT INTO events (${EVENT_COLUMNS}) VALUES (${placeholders(14)})
         ON CONFLICT(recurrence_id, date) WHERE recurrence_id IS NOT NULL DO NOTHING`,
        ...eventInsertParams(uuidV7(), draft, now),
      ),
    );
    const result = await this.db.transaction(statements);
    if (!result.ok) return result;
    return ok({ inserted: result.value.rowsAffected });
  }

  async update(id: string, patch: EventPatch): Promise<Result<Event>> {
    const sets: string[] = [];
    const params: SqlValue[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as (keyof EventPatch)[]) {
      if (!(key in patch)) continue;
      const value = patch[key];
      sets.push(`${PATCH_COLUMNS[key]} = ?`);
      params.push(key === 'meta' ? toJsonColumn(value) : (value as SqlValue));
    }
    const now = nowIsoTimestamp();
    sets.push('updated_at = ?');
    params.push(now, id);
    const result = await this.db.transaction([stmt(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`, ...params)]);
    if (!result.ok) return result;
    if (result.value.rowsAffected === 0) return err(notFound('el movimiento', id));
    const updated = await this.findById(id);
    if (!updated.ok) return updated;
    return updated.value ? ok(updated.value) : err(notFound('el movimiento', id));
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM events WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('el movimiento', id)) : ok(undefined);
  }
}
