/**
 * Regla de categorización automática: «si el concepto contiene X, la
 * categoría es Y». Se aplica al importar extractos y como sugerencia en el
 * formulario. El texto se compara normalizado (sin mayúsculas ni acentos).
 */
export interface CategoryRule {
  readonly id: string;
  /** Texto a buscar dentro del concepto, tal como lo escribió el usuario. */
  readonly pattern: string;
  readonly categoryId: string;
  /** Orden de evaluación entre reglas; a igual orden gana la más específica (patrón más largo). */
  readonly sortOrder: number;
  /** Veces que la regla ha clasificado un movimiento (importación o aplicación en bloque). */
  readonly hits: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CategoryRuleDraft = Pick<CategoryRule, 'pattern' | 'categoryId'> & Partial<Pick<CategoryRule, 'sortOrder'>>;

export type CategoryRulePatch = Partial<Pick<CategoryRule, 'pattern' | 'categoryId' | 'sortOrder'>>;

/** Longitud mínima del patrón: con menos, casi cualquier concepto coincidiría. */
export const MIN_RULE_PATTERN_LENGTH = 2;
