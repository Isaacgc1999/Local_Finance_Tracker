import { notFound, validationError } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import {
  type CategoryRule,
  type CategoryRuleDraft,
  type CategoryRulePatch,
  MIN_RULE_PATTERN_LENGTH,
} from '../../core/types/category-rule';
import { nowIsoTimestamp } from '../../core/types/iso-date';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, type SqlValue, placeholders, stmt } from '../db/database';

interface RuleRow {
  readonly id: string;
  readonly pattern: string;
  readonly category_id: string;
  readonly sort_order: number;
  readonly hits: number;
  readonly created_at: string;
  readonly updated_at: string;
}

const COLUMNS = 'id, pattern, category_id, sort_order, hits, created_at, updated_at';

function rowToRule(row: RuleRow): CategoryRule {
  return {
    id: row.id,
    pattern: row.pattern,
    categoryId: row.category_id,
    sortOrder: row.sort_order,
    hits: row.hits,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanPattern(pattern: string): Result<string> {
  const clean = pattern.trim().replace(/\s+/g, ' ');
  if (clean.length < MIN_RULE_PATTERN_LENGTH) {
    return err(validationError('pattern', `El texto tiene que tener al menos ${MIN_RULE_PATTERN_LENGTH} caracteres.`));
  }
  return ok(clean);
}

/** Reglas «si el concepto contiene X → categoría Y», en su orden de evaluación. */
export class CategoryRulesRepository {
  constructor(private readonly db: DatabaseHandle) {}

  async findAll(): Promise<Result<readonly CategoryRule[]>> {
    const rows = await this.db.select<RuleRow>(
      `SELECT ${COLUMNS} FROM category_rules ORDER BY sort_order, length(pattern) DESC, pattern COLLATE NOCASE`,
    );
    if (!rows.ok) return rows;
    return ok(rows.value.map(rowToRule));
  }

  async findById(id: string): Promise<Result<CategoryRule | null>> {
    const rows = await this.db.select<RuleRow>(`SELECT ${COLUMNS} FROM category_rules WHERE id = ?`, [id]);
    if (!rows.ok) return rows;
    const row = rows.value[0];
    return ok(row ? rowToRule(row) : null);
  }

  /** La regla cuyo patrón es exactamente ese texto (sin distinguir mayúsculas), si existe. */
  async findByPattern(pattern: string): Promise<Result<CategoryRule | null>> {
    const clean = cleanPattern(pattern);
    if (!clean.ok) return ok(null);
    const rows = await this.db.select<RuleRow>(`SELECT ${COLUMNS} FROM category_rules WHERE pattern = ? COLLATE NOCASE`, [clean.value]);
    if (!rows.ok) return rows;
    const row = rows.value[0];
    return ok(row ? rowToRule(row) : null);
  }

  async insert(draft: CategoryRuleDraft, id: string = uuidV7()): Promise<Result<CategoryRule>> {
    const pattern = cleanPattern(draft.pattern);
    if (!pattern.ok) return pattern;
    if (!draft.categoryId) return err(validationError('categoryId', 'Elige una categoría.'));
    const existing = await this.findByPattern(pattern.value);
    if (!existing.ok) return existing;
    if (existing.value) return err(validationError('pattern', `Ya hay una regla para «${existing.value.pattern}».`));
    const now = nowIsoTimestamp();
    const sortOrder = draft.sortOrder ?? 0;
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO category_rules (${COLUMNS}) VALUES (?, ?, ?, ?, 0, ?, ?)`,
        id,
        pattern.value,
        draft.categoryId,
        sortOrder,
        now,
        now,
      ),
    ]);
    if (!result.ok) return result;
    return ok({ id, pattern: pattern.value, categoryId: draft.categoryId, sortOrder, hits: 0, createdAt: now, updatedAt: now });
  }

  /**
   * Crea la regla o, si ya existe una con ese patrón, la apunta a la nueva
   * categoría. Es lo que hace «Recordar como regla» al recategorizar en bloque.
   */
  async upsertByPattern(draft: CategoryRuleDraft): Promise<Result<CategoryRule>> {
    const existing = await this.findByPattern(draft.pattern);
    if (!existing.ok) return existing;
    if (existing.value) return this.update(existing.value.id, { categoryId: draft.categoryId });
    return this.insert(draft);
  }

  async update(id: string, patch: CategoryRulePatch): Promise<Result<CategoryRule>> {
    const sets: string[] = [];
    const params: SqlValue[] = [];
    if (patch.pattern !== undefined) {
      const pattern = cleanPattern(patch.pattern);
      if (!pattern.ok) return pattern;
      const clash = await this.findByPattern(pattern.value);
      if (!clash.ok) return clash;
      if (clash.value && clash.value.id !== id) return err(validationError('pattern', `Ya hay una regla para «${clash.value.pattern}».`));
      sets.push('pattern = ?');
      params.push(pattern.value);
    }
    if (patch.categoryId !== undefined) {
      if (!patch.categoryId) return err(validationError('categoryId', 'Elige una categoría.'));
      sets.push('category_id = ?');
      params.push(patch.categoryId);
    }
    if (patch.sortOrder !== undefined) {
      sets.push('sort_order = ?');
      params.push(patch.sortOrder);
    }
    sets.push('updated_at = ?');
    params.push(nowIsoTimestamp(), id);
    const result = await this.db.transaction([stmt(`UPDATE category_rules SET ${sets.join(', ')} WHERE id = ?`, ...params)]);
    if (!result.ok) return result;
    if (result.value.rowsAffected === 0) return err(notFound('la regla', id));
    const updated = await this.findById(id);
    if (!updated.ok) return updated;
    return updated.value ? ok(updated.value) : err(notFound('la regla', id));
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM category_rules WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('la regla', id)) : ok(undefined);
  }

  /** Suma aciertos a varias reglas de golpe (tras una importación o una aplicación en bloque). */
  async addHits(counts: ReadonlyMap<string, number>): Promise<Result<void>> {
    const entries = [...counts.entries()].filter(([, n]) => n > 0);
    if (entries.length === 0) return ok(undefined);
    const now = nowIsoTimestamp();
    const result = await this.db.transaction(
      entries.map(([id, n]) => stmt('UPDATE category_rules SET hits = hits + ?, updated_at = ? WHERE id = ?', n, now, id)),
    );
    return result.ok ? ok(undefined) : result;
  }

  async deleteMany(ids: readonly string[]): Promise<Result<void>> {
    if (ids.length === 0) return ok(undefined);
    const result = await this.db.transaction([stmt(`DELETE FROM category_rules WHERE id IN (${placeholders(ids.length)})`, ...ids)]);
    return result.ok ? ok(undefined) : result;
  }
}
