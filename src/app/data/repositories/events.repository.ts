import { notFound } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import type { Event, EventDraft, EventPatch, EventType } from '../../core/types/event';
import { type DateRange, type IsoDate, nowIsoTimestamp } from '../../core/types/iso-date';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, type SqlStatement, type SqlValue, placeholders, stmt } from '../db/database';
import { EVENT_COLUMNS, type EventRow, eventInsertParams, rowToEvent } from '../mappers/event.mapper';
import { mapRows, toJsonColumn } from '../mappers/json';

/** Un concepto ya usado, con la categoría de su uso más reciente. */
export interface ConceptUsage {
  readonly concept: string;
  readonly categoryId: string | null;
  readonly lastDate: IsoDate;
  readonly uses: number;
}

export interface EventQueryFilters {
  readonly types?: readonly EventType[];
  readonly categoryIds?: readonly string[];
  readonly accountIds?: readonly string[];
  /** Búsqueda en concepto (sin distinguir mayúsculas). */
  readonly search?: string;
}

const INSERT_SQL = `INSERT INTO events (${EVENT_COLUMNS}) VALUES (${placeholders(15)})`;

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
  accountId: 'account_id',
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
    if (filters.accountIds && filters.accountIds.length > 0) {
      where.push(`account_id IN (${placeholders(filters.accountIds.length)})`);
      params.push(...filters.accountIds);
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

  /** Alta en bloque (importación de extractos) en una sola transacción. */
  async insertMany(drafts: readonly EventDraft[]): Promise<Result<{ readonly inserted: number }>> {
    if (drafts.length === 0) return ok({ inserted: 0 });
    const now = nowIsoTimestamp();
    const result = await this.db.transaction(drafts.map((draft) => stmt(INSERT_SQL, ...eventInsertParams(uuidV7(), draft, now))));
    if (!result.ok) return result;
    return ok({ inserted: result.value.rowsAffected });
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
        `INSERT INTO events (${EVENT_COLUMNS}) VALUES (${placeholders(15)})
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

  /**
   * Cambia la categoría de varios movimientos en una transacción. Devuelve
   * cuántas filas cambiaron de verdad (las que ya la tenían no cuentan).
   */
  async updateCategoryMany(ids: readonly string[], categoryId: string | null): Promise<Result<{ readonly updated: number }>> {
    if (ids.length === 0) return ok({ updated: 0 });
    const result = await this.db.transaction([
      stmt(
        `UPDATE events SET category_id = ?, updated_at = ? WHERE id IN (${placeholders(ids.length)}) AND category_id IS NOT ?`,
        categoryId,
        nowIsoTimestamp(),
        ...ids,
        categoryId,
      ),
    ]);
    if (!result.ok) return result;
    return ok({ updated: result.value.rowsAffected });
  }

  async deleteMany(ids: readonly string[]): Promise<Result<{ readonly deleted: number }>> {
    if (ids.length === 0) return ok({ deleted: 0 });
    const result = await this.db.transaction([stmt(`DELETE FROM events WHERE id IN (${placeholders(ids.length)})`, ...ids)]);
    if (!result.ok) return result;
    return ok({ deleted: result.value.rowsAffected });
  }

  /**
   * Conceptos distintos ya usados, del más reciente al más antiguo, con la
   * categoría de su último uso: alimenta el autocompletado del formulario y
   * la sugerencia por historial. Agrupa sin distinguir mayúsculas.
   */
  async recentConcepts(limit: number, types?: readonly EventType[]): Promise<Result<readonly ConceptUsage[]>> {
    const where = types && types.length > 0 ? `WHERE type IN (${placeholders(types.length)})` : '';
    const params: SqlValue[] = types && types.length > 0 ? [...types] : [];
    params.push(limit);
    // Ventanas en vez de GROUP BY: con más de un agregado, SQLite no garantiza
    // de qué fila salen las columnas sueltas (concept, category_id).
    const rows = await this.db.select<{ concept: string; category_id: string | null; last_date: string; uses: number }>(
      `SELECT concept, category_id, date AS last_date, uses FROM (
         SELECT concept, category_id, date,
                ROW_NUMBER() OVER (PARTITION BY lower(concept) ORDER BY date DESC, created_at DESC) AS rn,
                COUNT(*) OVER (PARTITION BY lower(concept)) AS uses
         FROM events ${where}
       ) WHERE rn = 1 ORDER BY last_date DESC LIMIT ?`,
      params,
    );
    if (!rows.ok) return rows;
    return ok(rows.value.map((r) => ({ concept: r.concept, categoryId: r.category_id, lastDate: r.last_date as IsoDate, uses: r.uses })));
  }

  /**
   * Candidatos a recategorizar en bloque con las reglas: los que no tienen
   * categoría o tienen una de las «cajón de sastre» que asigna la importación.
   */
  async findCategorizable(fallbackCategoryIds: readonly string[]): Promise<Result<readonly Event[]>> {
    const ids = fallbackCategoryIds.length > 0 ? `OR category_id IN (${placeholders(fallbackCategoryIds.length)})` : '';
    const rows = await this.db.select<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM events WHERE type IN ('expense','income','subscription','direct_debit') AND (category_id IS NULL ${ids}) ORDER BY date DESC`,
      [...fallbackCategoryIds],
    );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToEvent);
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM events WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('el movimiento', id)) : ok(undefined);
  }
}
