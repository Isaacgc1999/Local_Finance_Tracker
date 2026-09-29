import type { AppError, ValidationError } from '../../core/errors/app-error';
import { SYSTEM_CATEGORY } from '../../core/types/category';
import type { Event, EventDraft } from '../../core/types/event';
import { type IsoDate, maxIso, minIso } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import type { Repositories } from '../../data/repositories';
import { type CompiledRule, compileRules, matchRule, normalizeText } from '../categorization/category-rules';
import { validateEventDraft } from '../events/event.service';
import {
  type ColumnMapping,
  cellText,
  detectDateOrder,
  isMappingComplete,
  parseAmountCell,
  parseDateCell,
} from './statement-columns';
import type { SheetRows } from './statement-file';

export type ImportType = 'expense' | 'income';

/**
 * - `new`: no está en la base de datos.
 * - `duplicate`: ya existe un movimiento con misma fecha, tipo, importe y concepto.
 * - `possible_duplicate`: misma fecha, tipo e importe pero otro concepto
 *   (lo típico cuando se apuntó a mano antes de importar).
 * - `invalid`: la fila no se puede importar (`error` dice por qué).
 */
export type ImportRowStatus = 'new' | 'duplicate' | 'possible_duplicate' | 'invalid';

export interface ImportRow {
  /** Fila en el fichero, 1-indexada, para que el usuario la encuentre. */
  readonly line: number;
  readonly date: IsoDate | null;
  readonly concept: string;
  /** Céntimos con signo tal como vienen del banco. */
  readonly signedCents: number | null;
  readonly type: ImportType | null;
  readonly status: ImportRowStatus;
  readonly error: string | null;
  /** Concepto del movimiento existente con el que coincide. */
  readonly matchedConcept: string | null;
  /** Categoría que le asigna una regla de categorización, o `null` si ninguna coincide. */
  readonly categoryId: string | null;
  /** La regla que decidió esa categoría. */
  readonly ruleId: string | null;
}

export interface ImportPreview {
  readonly rows: readonly ImportRow[];
  readonly counts: Readonly<Record<ImportRowStatus, number>>;
  readonly range: { readonly from: IsoDate; readonly to: IsoDate } | null;
}

export interface ParsedRow {
  readonly line: number;
  readonly date: IsoDate | null;
  readonly concept: string;
  readonly signedCents: number | null;
  readonly error: string | null;
}

/** Filas de datos según el mapeo, sin mirar la base de datos. */
export function parseRows(rows: SheetRows, mapping: ColumnMapping, expectedCurrency: string): readonly ParsedRow[] {
  if (!isMappingComplete(mapping)) return [];
  const dataRows = rows.slice(mapping.headerRow + 1);
  const order = detectDateOrder(dataRows.map((r) => (mapping.date === null ? null : (r[mapping.date] ?? null))));
  const out: ParsedRow[] = [];
  dataRows.forEach((row, i) => {
    const line = mapping.headerRow + 2 + i;
    const at = (col: number | null) => (col === null ? null : (row[col] ?? null));
    const rawDate = at(mapping.date);
    const date = parseDateCell(rawDate, order);
    const concept = cellText(at(mapping.concept));
    let signedCents: number | null;
    if (mapping.amount !== null) {
      signedCents = parseAmountCell(at(mapping.amount));
    } else {
      const debit = parseAmountCell(at(mapping.debit));
      const credit = parseAmountCell(at(mapping.credit));
      signedCents = debit === null && credit === null ? null : (credit ?? 0) - Math.abs(debit ?? 0);
    }

    // Filas de totales o pies de página: sin fecha ni importe, se ignoran sin avisar.
    if (date === null && signedCents === null) return;

    const currency = cellText(at(mapping.currency)).toUpperCase();
    let error: string | null = null;
    if (date === null) error = `Fecha no válida: «${cellText(rawDate)}».`;
    else if (signedCents === null) error = 'Importe no válido.';
    else if (signedCents === 0) error = 'Importe cero.';
    else if (!Number.isSafeInteger(signedCents)) error = 'Importe fuera de rango.';
    else if (currency && currency !== expectedCurrency.toUpperCase() && currency !== '€') {
      error = `Divisa ${currency}; la app lleva los importes en ${expectedCurrency}.`;
    }
    out.push({ line, date, concept: concept || 'Movimiento importado', signedCents, error });
  });
  return out;
}

/** Misma normalización que las reglas de categorización: sin acentos, mayúsculas ni puntuación. */
export const normalizeConcept = normalizeText;

/**
 * Marca duplicados contra los movimientos existentes. Cada movimiento
 * existente cuenta una sola vez: si el extracto trae dos cafés iguales el
 * mismo día y ya hay uno guardado, el segundo sigue siendo nuevo.
 */
export function buildPreview(parsed: readonly ParsedRow[], existing: readonly Event[], rules: readonly CompiledRule[] = []): ImportPreview {
  const exactPool = new Map<string, Event[]>();
  const loosePool = new Map<string, Event[]>();
  const push = (map: Map<string, Event[]>, key: string, e: Event): void => {
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  };
  for (const e of existing) {
    if (e.type !== 'expense' && e.type !== 'income' && e.type !== 'subscription' && e.type !== 'direct_debit') continue;
    const type: ImportType = e.type === 'income' ? 'income' : 'expense';
    const loose = `${e.date}|${type}|${e.amountCents}`;
    push(exactPool, `${loose}|${normalizeConcept(e.concept)}`, e);
    push(loosePool, loose, e);
  }
  const taken = new Set<string>();
  const takeFrom = (map: Map<string, Event[]>, key: string): Event | null => {
    const list = map.get(key) ?? [];
    const found = list.find((e) => !taken.has(e.id)) ?? null;
    if (found) taken.add(found.id);
    return found;
  };

  const base = parsed.map((p) => {
    const type: ImportType | null = p.signedCents === null || p.signedCents === 0 ? null : p.signedCents < 0 ? 'expense' : 'income';
    return { p, type, loose: p.date && type ? `${p.date}|${type}|${Math.abs(p.signedCents ?? 0)}` : null };
  });
  const status = new Map<number, { status: ImportRowStatus; matched: string | null }>();
  // Primero las coincidencias exactas, para que no se las lleve una aproximada.
  for (const { p, loose } of base) {
    if (p.error || !loose) continue;
    const hit = takeFrom(exactPool, `${loose}|${normalizeConcept(p.concept)}`);
    if (hit) status.set(p.line, { status: 'duplicate', matched: hit.concept });
  }
  for (const { p, loose } of base) {
    if (p.error || !loose || status.has(p.line)) continue;
    const hit = takeFrom(loosePool, loose);
    status.set(p.line, hit ? { status: 'possible_duplicate', matched: hit.concept } : { status: 'new', matched: null });
  }

  const counts: Record<ImportRowStatus, number> = { new: 0, duplicate: 0, possible_duplicate: 0, invalid: 0 };
  const rows = base.map(({ p, type }): ImportRow => {
    const s = p.error ? { status: 'invalid' as const, matched: null } : (status.get(p.line) ?? { status: 'new' as const, matched: null });
    counts[s.status]++;
    const rule = p.error ? null : matchRule(rules, p.concept);
    return {
      line: p.line,
      date: p.date,
      concept: p.concept,
      signedCents: p.signedCents,
      type: p.error ? null : type,
      status: s.status,
      error: p.error,
      matchedConcept: s.matched,
      categoryId: rule?.categoryId ?? null,
      ruleId: rule?.id ?? null,
    };
  });
  return { rows, counts, range: dateRangeOf(parsed) };
}

function dateRangeOf(parsed: readonly ParsedRow[]): { from: IsoDate; to: IsoDate } | null {
  let range: { from: IsoDate; to: IsoDate } | null = null;
  for (const p of parsed) {
    if (!p.date) continue;
    range = range ? { from: minIso(range.from, p.date), to: maxIso(range.to, p.date) } : { from: p.date, to: p.date };
  }
  return range;
}

/** Solo las nuevas vienen marcadas; duplicados y posibles duplicados se importan si el usuario los marca. */
export function selectedByDefault(row: ImportRow): boolean {
  return row.status === 'new';
}

/** Opciones del guardado: fichero de origen, cuenta del extracto y categorías por defecto. */
export interface ImportCommitOptions {
  readonly fileName: string;
  /** Cuenta a la que pertenece el extracto; `null` = sin cuenta asignada. */
  readonly accountId: string | null;
  readonly expenseCategoryId: string;
  readonly incomeCategoryId: string;
  /** Cuenta a la que van todos los movimientos, o `null` para dejarlos sin cuenta. */
  readonly accountId?: string | null;
}

export const DEFAULT_IMPORT_CATEGORIES = {
  expense: SYSTEM_CATEGORY.otros,
  income: SYSTEM_CATEGORY.otrosIngresos,
} as const;

export function toDraft(row: ImportRow, options: ImportCommitOptions): EventDraft | null {
  if (row.status === 'invalid' || !row.date || !row.type || row.signedCents === null) return null;
  const expense = row.type === 'expense';
  return {
    type: row.type,
    amountCents: money(Math.abs(row.signedCents)),
    date: row.date,
    concept: row.concept,
    categoryId: row.categoryId ?? (expense ? options.expenseCategoryId : options.incomeCategoryId),
    nature: expense ? 'variable' : null,
    paymentMethod: null,
    notes: `Importado de ${options.fileName}`,
    attachmentPath: null,
    recurrenceId: null,
    accountId: options.accountId ?? null,
    meta: expense ? { type: 'expense' } : { type: 'income' },
  };
}

/** Casos de uso del importador. Depende de los repositorios, no de Angular. */
export class StatementImportService {
  constructor(private readonly repos: Repositories) {}

  /** Vista previa: duplicados contra la base de datos y categoría según las reglas. */
  async preview(parsed: readonly ParsedRow[]): Promise<Result<ImportPreview>> {
    const rules = await this.repos.categoryRules.findAll();
    if (!rules.ok) return rules;
    const compiled = compileRules(rules.value);
    const range = dateRangeOf(parsed);
    if (!range) return ok(buildPreview(parsed, [], compiled));
    const existing = await this.repos.events.findInRange(range);
    if (!existing.ok) return existing;
    return ok(buildPreview(parsed, existing.value, compiled));
  }

  /** Guarda las filas elegidas en una única transacción: o entran todas o ninguna. */
  async commit(rows: readonly ImportRow[], options: ImportCommitOptions): Promise<Result<{ readonly inserted: number }, AppError | readonly ValidationError[]>> {
    const drafts: EventDraft[] = [];
    for (const row of rows) {
      const draft = toDraft(row, options);
      if (!draft) continue;
      const valid = validateEventDraft(draft);
      if (!valid.ok) return err(valid.error);
      drafts.push(valid.value);
    }
    if (drafts.length === 0) return ok({ inserted: 0 });
    const result = await this.repos.events.insertMany(drafts);
    if (!result.ok) return result;
    // Los aciertos de las reglas son solo estadística: si falla, la importación ya está hecha.
    await this.repos.categoryRules.addHits(countHits(rows));
    return ok({ inserted: result.value.inserted });
  }
}

/** Veces que cada regla ha clasificado una fila de las que se van a guardar. */
export function countHits(rows: readonly Pick<ImportRow, 'ruleId' | 'status'>[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status === 'invalid' || !row.ruleId) continue;
    counts.set(row.ruleId, (counts.get(row.ruleId) ?? 0) + 1);
  }
  return counts;
}
