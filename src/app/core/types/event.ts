import type { IsoDate } from './iso-date';
import type { Money } from './money';

export const EVENT_TYPES = [
  'expense',
  'income',
  'subscription',
  'direct_debit',
  'saving',
  'investment',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

/** Etiquetas del segmented del handoff, en su orden. */
export const EVENT_TYPE_LABEL: Readonly<Record<EventType, string>> = {
  expense: 'Gasto',
  income: 'Ingreso',
  subscription: 'Suscripción',
  direct_debit: 'Domiciliación',
  saving: 'Ahorro',
  investment: 'Inversión',
};

/** Etiqueta corta para la fila de chips móvil («Domicil.»). */
export const EVENT_TYPE_LABEL_SHORT: Readonly<Record<EventType, string>> = {
  ...EVENT_TYPE_LABEL,
  direct_debit: 'Domicil.',
};

export type SemanticColor = 'income' | 'expense' | 'investment' | 'savings' | 'accent' | 'neutral';

/** Color semántico del handoff por tipo (formulario, KPI). */
export const EVENT_TYPE_COLOR: Readonly<Record<EventType, SemanticColor>> = {
  expense: 'expense',
  income: 'income',
  subscription: 'accent',
  direct_debit: 'neutral',
  saving: 'savings',
  investment: 'investment',
};

/**
 * Color con el que se pinta el importe: verde lo que entra, rojo todo lo que
 * sale de la cuenta (gasto, suscripción, domiciliación, ahorro e inversión).
 */
export const EVENT_AMOUNT_COLOR: Readonly<Record<EventType, SemanticColor>> = {
  expense: 'expense',
  income: 'income',
  subscription: 'expense',
  direct_debit: 'expense',
  saving: 'expense',
  investment: 'expense',
};

/** Tipos que restan del balance como gasto (excluye ahorro e inversión, que son traspasos). */
export const OUTFLOW_TYPES: readonly EventType[] = ['expense', 'subscription', 'direct_debit'];

export function isOutflow(type: EventType): boolean {
  return OUTFLOW_TYPES.includes(type);
}

/** Signo aplicado al importe en el balance: +1 ingreso, −1 el resto. */
export function balanceSign(type: EventType): 1 | -1 {
  return type === 'income' ? 1 : -1;
}

export type Nature = 'fixed' | 'variable';

export const NATURE_LABEL: Readonly<Record<Nature, string>> = { fixed: 'Fijo', variable: 'Variable' };

export type AssetClass = 'index_fund' | 'etf' | 'stock' | 'crypto' | 'pension';

export const ASSET_CLASS_LABEL: Readonly<Record<AssetClass, string>> = {
  index_fund: 'Fondo indexado',
  etf: 'ETF',
  stock: 'Acciones',
  crypto: 'Cripto',
  pension: 'Plan de pensiones',
};

/** Campos específicos de cada tipo, guardados en la columna JSON `meta`. */
export type EventMeta =
  | { readonly type: 'expense' }
  | { readonly type: 'income'; readonly source?: string }
  | { readonly type: 'subscription'; readonly service?: string }
  | { readonly type: 'direct_debit'; readonly issuer?: string }
  | {
      readonly type: 'saving';
      readonly account?: string;
      readonly goal?: string;
      /** Hucha de la sección Ahorros a la que va; sin ella cuenta como «Ahorro general». */
      readonly potId?: string;
    }
  | {
      readonly type: 'investment';
      readonly ticker: string;
      readonly platform?: string;
      readonly assetClass?: AssetClass;
    };

export interface Event {
  readonly id: string;
  readonly type: EventType;
  /** Siempre positivo; el signo lo da el tipo. */
  readonly amountCents: Money;
  readonly date: IsoDate;
  readonly concept: string;
  readonly categoryId: string | null;
  /** Solo aplica a gastos. */
  readonly nature: Nature | null;
  readonly paymentMethod: string | null;
  readonly notes: string | null;
  readonly attachmentPath: string | null;
  /** Presente cuando la fila es una instancia materializada de una regla. */
  readonly recurrenceId: string | null;
  /** Cuenta de la que sale o a la que entra el dinero; `null` = sin cuenta asignada. */
  readonly accountId: string | null;
  readonly meta: EventMeta | null;
  /** De dónde viene: apuntado a mano, importado de un extracto o generado por una regla. */
  readonly source: EventSource;
  /** Importación a la que pertenece (para deshacerla entera); `null` si no es importado. */
  readonly importBatch: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Al crear, el origen es opcional: sin él, una fila con regla es
 * «recurrence» y el resto «manual». Solo el importador lo pone a mano.
 */
export type EventDraft = Omit<Event, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'importBatch'> & {
  readonly source?: EventSource;
  readonly importBatch?: string | null;
};

export type EventPatch = Partial<Omit<EventDraft, 'type' | 'source' | 'importBatch'>>;

export const EVENT_SOURCES = ['manual', 'import', 'recurrence'] as const;

export type EventSource = (typeof EVENT_SOURCES)[number];

export function isEventSource(value: unknown): value is EventSource {
  return typeof value === 'string' && (EVENT_SOURCES as readonly string[]).includes(value);
}

export const EVENT_SOURCE_LABEL: Readonly<Record<EventSource, string>> = {
  manual: 'Manual',
  import: 'Importado',
  recurrence: 'Recurrente',
};

/** Origen efectivo de un borrador que no lo indica. */
export function sourceOfDraft(draft: EventDraft): EventSource {
  return draft.source ?? (draft.recurrenceId ? 'recurrence' : 'manual');
}

/** Dos letras para el avatar de la fila («ME» de Mercadona, «NÓ» de Nómina). */
export function initialsOf(concept: string): string {
  const clean = concept.trim();
  if (!clean) return '··';
  const words = clean.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length >= 2 && words[0] && words[1]) {
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}
