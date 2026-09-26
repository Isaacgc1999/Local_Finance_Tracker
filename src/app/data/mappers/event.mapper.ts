import { dbError } from '../../core/errors/app-error';
import { type Event, type EventDraft, type EventMeta, isEventType } from '../../core/types/event';
import { isIsoDate } from '../../core/types/iso-date';
import { tryMoney } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import type { SqlValue } from '../db/database';
import { parseJsonColumn, toJsonColumn } from './json';

export interface EventRow {
  readonly id: string;
  readonly type: string;
  readonly amount_cents: number;
  readonly date: string;
  readonly concept: string;
  readonly category_id: string | null;
  readonly nature: string | null;
  readonly payment_method: string | null;
  readonly notes: string | null;
  readonly attachment_path: string | null;
  readonly recurrence_id: string | null;
  readonly account_id: string | null;
  readonly meta: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export const EVENT_COLUMNS =
  'id, type, amount_cents, date, concept, category_id, nature, payment_method, notes, attachment_path, recurrence_id, account_id, meta, created_at, updated_at';

export function rowToEvent(row: EventRow): Result<Event> {
  if (!isEventType(row.type)) return err(dbError(`Tipo de evento desconocido: ${row.type}`));
  if (!isIsoDate(row.date)) return err(dbError(`Fecha inválida en events.${row.id}: ${row.date}`));
  const amount = tryMoney(row.amount_cents, 'amount_cents');
  if (!amount.ok) return amount;
  const meta = parseJsonColumn<EventMeta>(row.meta, 'events.meta');
  if (!meta.ok) return meta;
  const nature = row.nature === 'fixed' || row.nature === 'variable' ? row.nature : null;
  return ok({
    id: row.id,
    type: row.type,
    amountCents: amount.value,
    date: row.date,
    concept: row.concept,
    categoryId: row.category_id,
    nature,
    paymentMethod: row.payment_method,
    notes: row.notes,
    attachmentPath: row.attachment_path,
    recurrenceId: row.recurrence_id,
    accountId: row.account_id,
    meta: meta.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/** Parámetros en el orden de `EVENT_COLUMNS` para un INSERT. */
export function eventInsertParams(id: string, draft: EventDraft, now: string): SqlValue[] {
  return [
    id,
    draft.type,
    draft.amountCents,
    draft.date,
    draft.concept,
    draft.categoryId,
    draft.nature,
    draft.paymentMethod,
    draft.notes,
    draft.attachmentPath,
    draft.recurrenceId,
    draft.accountId,
    toJsonColumn(draft.meta),
    now,
    now,
  ];
}
