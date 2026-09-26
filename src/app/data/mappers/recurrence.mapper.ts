import { dbError } from '../../core/errors/app-error';
import { type EventMeta, isEventType } from '../../core/types/event';
import { isIsoDate } from '../../core/types/iso-date';
import { tryMoney } from '../../core/types/money';
import { type Recurrence, type RecurrenceDraft, isFrequency } from '../../core/types/recurrence';
import { type Result, err, ok } from '../../core/types/result';
import type { SqlValue } from '../db/database';
import { parseJsonColumn, toJsonColumn } from './json';

export interface RecurrenceRow {
  readonly id: string;
  readonly type: string;
  readonly amount_cents: number;
  readonly category_id: string | null;
  readonly concept: string;
  readonly frequency: string;
  readonly interval: number;
  readonly day_of_month: number | null;
  readonly weekday: number | null;
  readonly start_date: string;
  readonly end_date: string | null;
  readonly active: number;
  readonly payment_method: string | null;
  readonly account_id: string | null;
  readonly meta: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export const RECURRENCE_COLUMNS =
  'id, type, amount_cents, category_id, concept, frequency, interval, day_of_month, weekday, start_date, end_date, active, payment_method, account_id, meta, created_at, updated_at';

export function rowToRecurrence(row: RecurrenceRow): Result<Recurrence> {
  if (!isEventType(row.type)) return err(dbError(`Tipo de regla desconocido: ${row.type}`));
  if (!isFrequency(row.frequency)) return err(dbError(`Frecuencia desconocida: ${row.frequency}`));
  if (!isIsoDate(row.start_date)) return err(dbError(`start_date inválida en recurrences.${row.id}`));
  if (row.end_date !== null && !isIsoDate(row.end_date)) {
    return err(dbError(`end_date inválida en recurrences.${row.id}`));
  }
  const amount = tryMoney(row.amount_cents, 'amount_cents');
  if (!amount.ok) return amount;
  const meta = parseJsonColumn<EventMeta>(row.meta, 'recurrences.meta');
  if (!meta.ok) return meta;
  return ok({
    id: row.id,
    type: row.type,
    amountCents: amount.value,
    categoryId: row.category_id,
    concept: row.concept,
    frequency: row.frequency,
    interval: row.interval,
    dayOfMonth: row.day_of_month,
    weekday: row.weekday,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.active === 1,
    paymentMethod: row.payment_method,
    accountId: row.account_id,
    meta: meta.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function recurrenceInsertParams(id: string, draft: RecurrenceDraft, now: string): SqlValue[] {
  return [
    id,
    draft.type,
    draft.amountCents,
    draft.categoryId,
    draft.concept,
    draft.frequency,
    draft.interval,
    draft.dayOfMonth,
    draft.weekday,
    draft.startDate,
    draft.endDate,
    draft.active ? 1 : 0,
    draft.paymentMethod,
    draft.accountId,
    toJsonColumn(draft.meta),
    now,
    now,
  ];
}
