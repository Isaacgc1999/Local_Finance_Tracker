import type { CategoryRule } from '../../core/types/category-rule';
import type { Event } from '../../core/types/event';

/**
 * Motor de categorización automática. Puro: mismas reglas y mismo concepto,
 * misma respuesta. Ni Angular ni SQL.
 *
 * El texto se compara normalizado: sin acentos, en minúsculas y con la
 * puntuación reducida a espacios, para que «Compra en MERCADONA, S.A.» y
 * «mercadona sa» sean lo mismo. Es la misma normalización que usa el
 * detector de duplicados de la importación.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Regla preparada para comparar muchas veces sin normalizar el patrón cada vez. */
export interface CompiledRule {
  readonly rule: CategoryRule;
  readonly needle: string;
}

/**
 * Ordena y normaliza las reglas una vez. El orden decide los empates: primero
 * `sortOrder`, luego el patrón más largo (más específico), luego alfabético.
 * Las reglas cuyo patrón queda vacío tras normalizar (solo signos) se ignoran.
 */
export function compileRules(rules: readonly CategoryRule[]): readonly CompiledRule[] {
  return rules
    .map((rule) => ({ rule, needle: normalizeText(rule.pattern) }))
    .filter((r) => r.needle.length > 0)
    .sort(
      (a, b) =>
        a.rule.sortOrder - b.rule.sortOrder ||
        b.needle.length - a.needle.length ||
        a.needle.localeCompare(b.needle, 'es'),
    );
}

/** Primera regla cuyo patrón aparece dentro del concepto, o `null`. */
export function matchRule(compiled: readonly CompiledRule[], concept: string): CategoryRule | null {
  if (compiled.length === 0) return null;
  const haystack = ` ${normalizeText(concept)} `;
  if (haystack.trim().length === 0) return null;
  for (const { rule, needle } of compiled) {
    if (haystack.includes(needle)) return rule;
  }
  return null;
}

export type SuggestionSource = 'rule' | 'history';

export interface CategorySuggestion {
  readonly categoryId: string;
  readonly source: SuggestionSource;
  /** La regla que decidió, si la hubo. */
  readonly rule: CategoryRule | null;
}

/**
 * Sugerencia para un concepto: manda la regla explícita; si no hay ninguna,
 * la categoría del movimiento más reciente con el mismo concepto normalizado
 * (`history` viene ordenado del más reciente al más antiguo).
 */
export function suggestCategory(
  compiled: readonly CompiledRule[],
  concept: string,
  history: readonly Pick<Event, 'concept' | 'categoryId'>[] = [],
): CategorySuggestion | null {
  const rule = matchRule(compiled, concept);
  if (rule) return { categoryId: rule.categoryId, source: 'rule', rule };
  const key = normalizeText(concept);
  if (!key) return null;
  const previous = history.find((e) => e.categoryId !== null && normalizeText(e.concept) === key);
  return previous?.categoryId ? { categoryId: previous.categoryId, source: 'history', rule: null } : null;
}

/**
 * Propuesta de patrón para «Recordar como regla» a partir de los conceptos
 * seleccionados: si todos comparten un prefijo de al menos una palabra, ese
 * prefijo; si solo hay un concepto distinto, el concepto entero. Los bancos
 * suelen añadir al final números de operación o fechas, y el prefijo común
 * los deja fuera.
 */
export function proposePattern(concepts: readonly string[]): string {
  const distinct = [...new Set(concepts.map((c) => c.trim()).filter(Boolean))];
  if (distinct.length === 0) return '';
  if (distinct.length === 1) return distinct[0] ?? '';
  const words = distinct.map((c) => c.split(/\s+/));
  const first = words[0] ?? [];
  const common: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const w = first[i] ?? '';
    const key = normalizeText(w);
    if (!key || !words.every((ws) => normalizeText(ws[i] ?? '') === key)) break;
    common.push(w);
  }
  return common.join(' ');
}
