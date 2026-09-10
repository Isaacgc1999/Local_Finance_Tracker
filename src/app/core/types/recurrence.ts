import type { EventMeta, EventType } from './event';
import type { IsoDate } from './iso-date';
import type { Money } from './money';

export const FREQUENCIES = ['weekly', 'monthly', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Readonly<Record<Frequency, string>> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
};

export function isFrequency(value: unknown): value is Frequency {
  return typeof value === 'string' && (FREQUENCIES as readonly string[]).includes(value);
}

/** La regla, separada de sus instancias. */
export interface Recurrence {
  readonly id: string;
  readonly type: EventType;
  readonly amountCents: Money;
  readonly categoryId: string | null;
  readonly concept: string;
  readonly frequency: Frequency;
  /** Cada N semanas / meses / años. */
  readonly interval: number;
  /** 1–31 para mensual y anual; se recorta al último día del mes. */
  readonly dayOfMonth: number | null;
  /** 1 = lunes … 7 = domingo, para semanal. */
  readonly weekday: number | null;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate | null;
  readonly active: boolean;
  readonly paymentMethod: string | null;
  readonly meta: EventMeta | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type RecurrenceDraft = Omit<Recurrence, 'id' | 'createdAt' | 'updatedAt'>;

export type RecurrencePatch = Partial<Omit<RecurrenceDraft, 'type'>>;

/** Ocurrencia proyectada, no persistida (dashboard «Próximos cargos»). */
export interface VirtualEvent {
  readonly recurrenceId: string;
  readonly date: IsoDate;
  readonly type: EventType;
  readonly amountCents: Money;
  readonly concept: string;
  readonly categoryId: string | null;
  /** Ya existe como fila real en `events` (y puede haberse editado a mano). */
  readonly materialized: boolean;
}
