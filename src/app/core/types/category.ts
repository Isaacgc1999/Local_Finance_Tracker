export type CategoryKind = 'expense' | 'income' | 'both';

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  /** «#RRGGBB», siempre uno de los colores del sistema del handoff. */
  readonly color: string;
  readonly kind: CategoryKind;
  readonly isSystem: boolean;
  readonly sortOrder: number;
}

export type CategoryDraft = Omit<Category, 'id' | 'isSystem'>;

export type CategoryPatch = Partial<Omit<Category, 'id' | 'isSystem'>>;

/**
 * Identificadores estables de las categorías de sistema (semilla), para que
 * el dominio pueda referirse a ellas (p. ej. el bucket «Ocio» del donut).
 */
export const SYSTEM_CATEGORY = {
  alimentacion: 'cat-alimentacion',
  hogar: 'cat-hogar',
  transporte: 'cat-transporte',
  ocio: 'cat-ocio',
  salud: 'cat-salud',
  formacion: 'cat-formacion',
  viajes: 'cat-viajes',
  otros: 'cat-otros',
  nomina: 'cat-nomina',
  otrosIngresos: 'cat-otros-ingresos',
} as const;

/** Categorías que alimentan el bucket «Ocio» del desglose por tipo de gasto. */
export const LEISURE_CATEGORY_IDS: readonly string[] = [SYSTEM_CATEGORY.ocio, SYSTEM_CATEGORY.viajes];

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}
