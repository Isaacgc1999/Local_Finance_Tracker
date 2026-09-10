import type { EventType, SemanticColor } from '../../core/types/event';

/** Campos que puede mostrar el formulario; cada tipo activa un subconjunto. */
export type FieldKey =
  | 'amount'
  | 'date'
  | 'category'
  | 'nature'
  | 'paymentMethod'
  | 'concept'
  | 'notes'
  | 'attachment'
  | 'source'
  | 'issuer'
  | 'account'
  | 'goal'
  | 'ticker'
  | 'platform'
  | 'assetClass';

/**
 * Estrategia por tipo: un único contenedor de formulario lee esta
 * configuración para decidir qué campos existen, cómo se etiquetan y cómo
 * se comporta la recurrencia. Gasto e Inversión salen del handoff; el resto
 * es propuesta (docs/FASE-0.md §c).
 */
export interface EventFormStrategy {
  readonly type: EventType;
  readonly fields: readonly FieldKey[];
  readonly amountLabel: string;
  /** Color del borde del importe cuando tiene el foco. */
  readonly amountTone: SemanticColor;
  readonly dateLabel: string;
  readonly conceptLabel: string;
  readonly conceptPlaceholder: string;
  /** `null` = sin categoría en este tipo. */
  readonly categoryKind: 'expense' | 'income' | null;
  readonly categoryRequired: boolean;
  /** `toggle` = bloque tras un interruptor; `always` = siempre visible; `none` = sin recurrencia. */
  readonly recurrence: 'toggle' | 'always' | 'none';
  readonly recurrenceLabel: string;
  readonly recurrenceHint: string;
  /** Título de la hoja móvil («Nuevo gasto»). */
  readonly mobileTitle: string;
}

export const FORM_STRATEGIES: Readonly<Record<EventType, EventFormStrategy>> = {
  expense: {
    type: 'expense',
    fields: ['amount', 'date', 'category', 'nature', 'paymentMethod', 'concept', 'notes', 'attachment'],
    amountLabel: 'Importe',
    amountTone: 'accent',
    dateLabel: 'Fecha',
    conceptLabel: 'Concepto',
    conceptPlaceholder: 'Mercadona · compra semanal',
    categoryKind: 'expense',
    categoryRequired: true,
    recurrence: 'toggle',
    recurrenceLabel: 'Recurrente',
    recurrenceHint: 'Se repetirá automáticamente',
    mobileTitle: 'Nuevo gasto',
  },
  income: {
    type: 'income',
    fields: ['amount', 'date', 'concept', 'source', 'category', 'notes'],
    amountLabel: 'Importe',
    amountTone: 'income',
    dateLabel: 'Fecha',
    conceptLabel: 'Concepto',
    conceptPlaceholder: 'Nómina Grupo Aldara',
    categoryKind: 'income',
    categoryRequired: false,
    recurrence: 'toggle',
    recurrenceLabel: 'Ingreso recurrente',
    recurrenceHint: 'Se registrará automáticamente cada periodo',
    mobileTitle: 'Nuevo ingreso',
  },
  subscription: {
    type: 'subscription',
    fields: ['amount', 'date', 'concept', 'category', 'paymentMethod', 'notes'],
    amountLabel: 'Cuota',
    amountTone: 'accent',
    dateLabel: 'Próximo cargo',
    conceptLabel: 'Servicio',
    conceptPlaceholder: 'Netflix Estándar',
    categoryKind: 'expense',
    categoryRequired: false,
    recurrence: 'always',
    recurrenceLabel: 'Frecuencia',
    recurrenceHint: 'Las suscripciones se repiten hasta que las canceles',
    mobileTitle: 'Nueva suscripción',
  },
  direct_debit: {
    type: 'direct_debit',
    fields: ['amount', 'date', 'concept', 'issuer', 'category', 'notes'],
    amountLabel: 'Importe',
    amountTone: 'expense',
    dateLabel: 'Próximo cargo',
    conceptLabel: 'Concepto',
    conceptPlaceholder: 'Seguro del coche',
    categoryKind: 'expense',
    categoryRequired: false,
    recurrence: 'always',
    recurrenceLabel: 'Frecuencia',
    recurrenceHint: 'Se cargará en cuenta cada periodo',
    mobileTitle: 'Nueva domiciliación',
  },
  saving: {
    type: 'saving',
    fields: ['amount', 'date', 'concept', 'account', 'goal', 'notes'],
    amountLabel: 'Importe ahorrado',
    amountTone: 'savings',
    dateLabel: 'Fecha',
    conceptLabel: 'Concepto',
    conceptPlaceholder: 'Traspaso a cuenta ahorro',
    categoryKind: null,
    categoryRequired: false,
    recurrence: 'toggle',
    recurrenceLabel: 'Aportación periódica',
    recurrenceHint: 'Se apuntará automáticamente cada periodo',
    mobileTitle: 'Nuevo ahorro',
  },
  investment: {
    type: 'investment',
    fields: ['amount', 'date', 'ticker', 'platform', 'assetClass', 'notes'],
    amountLabel: 'Importe aportado',
    amountTone: 'investment',
    dateLabel: 'Fecha',
    conceptLabel: 'Concepto',
    conceptPlaceholder: 'Aportación MSCI World',
    categoryKind: null,
    categoryRequired: false,
    recurrence: 'toggle',
    recurrenceLabel: 'Aportación periódica',
    recurrenceHint: 'Se apuntará automáticamente cada periodo',
    mobileTitle: 'Nueva inversión',
  },
};

/** Opciones de los selects (propuesta; el handoff solo muestra un valor de cada uno). */
export const PAYMENT_METHODS: readonly string[] = ['Tarjeta', 'Efectivo', 'Transferencia', 'Bizum', 'Domiciliación'];
export const INCOME_SOURCES: readonly string[] = ['Nómina', 'Transferencia', 'Efectivo', 'Devolución', 'Otro'];
export const PLATFORMS: readonly string[] = [
  'Indexa Capital',
  'MyInvestor',
  'Trade Republic',
  'DEGIRO',
  'Interactive Brokers',
  'Banco',
  'Otra',
];
