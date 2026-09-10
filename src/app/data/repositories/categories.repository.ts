import { notFound, validationError } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import { type Category, type CategoryDraft, type CategoryPatch, isHexColor } from '../../core/types/category';
import { nowIsoTimestamp } from '../../core/types/iso-date';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, type SqlValue, stmt } from '../db/database';
import { CATEGORY_COLUMNS, type CategoryRow, rowToCategory } from '../mappers/category.mapper';
import { mapRows } from '../mappers/json';

export class CategoriesRepository {
  constructor(private readonly db: DatabaseHandle) {}

  /** Todas, o las aplicables a un tipo (`kind = X OR kind = 'both'`), en su orden. */
  async findAll(kind?: 'expense' | 'income'): Promise<Result<readonly Category[]>> {
    const rows = kind
      ? await this.db.select<CategoryRow>(
          `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE kind IN (?, 'both') ORDER BY sort_order, name COLLATE NOCASE`,
          [kind],
        )
      : await this.db.select<CategoryRow>(
          `SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY sort_order, name COLLATE NOCASE`,
        );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToCategory);
  }

  async findById(id: string): Promise<Result<Category | null>> {
    const rows = await this.db.select<CategoryRow>(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = ?`, [id]);
    if (!rows.ok) return rows;
    const row = rows.value[0];
    return row ? rowToCategory(row) : ok(null);
  }

  async insert(draft: CategoryDraft, id: string = uuidV7()): Promise<Result<Category>> {
    const name = draft.name.trim();
    if (!name) return err(validationError('name', 'El nombre es obligatorio.'));
    if (!isHexColor(draft.color)) return err(validationError('color', 'Color no válido.'));
    const now = nowIsoTimestamp();
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO categories (${CATEGORY_COLUMNS}, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        id,
        name,
        draft.icon,
        draft.color,
        draft.kind,
        draft.sortOrder,
        now,
        now,
      ),
    ]);
    if (!result.ok) return result;
    return ok({ id, name, icon: draft.icon, color: draft.color, kind: draft.kind, isSystem: false, sortOrder: draft.sortOrder });
  }

  async update(id: string, patch: CategoryPatch): Promise<Result<Category>> {
    const sets: string[] = [];
    const params: SqlValue[] = [];
    if ('name' in patch && patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) return err(validationError('name', 'El nombre es obligatorio.'));
      sets.push('name = ?');
      params.push(name);
    }
    if ('icon' in patch && patch.icon !== undefined) {
      sets.push('icon = ?');
      params.push(patch.icon);
    }
    if ('color' in patch && patch.color !== undefined) {
      if (!isHexColor(patch.color)) return err(validationError('color', 'Color no válido.'));
      sets.push('color = ?');
      params.push(patch.color);
    }
    if ('kind' in patch && patch.kind !== undefined) {
      sets.push('kind = ?');
      params.push(patch.kind);
    }
    if ('sortOrder' in patch && patch.sortOrder !== undefined) {
      sets.push('sort_order = ?');
      params.push(patch.sortOrder);
    }
    sets.push('updated_at = ?');
    params.push(nowIsoTimestamp(), id);
    const result = await this.db.transaction([stmt(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, ...params)]);
    if (!result.ok) return result;
    if (result.value.rowsAffected === 0) return err(notFound('la categoría', id));
    const updated = await this.findById(id);
    if (!updated.ok) return updated;
    return updated.value ? ok(updated.value) : err(notFound('la categoría', id));
  }

  /** Los movimientos que la usaban quedan sin categoría (FK ON DELETE SET NULL). */
  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM categories WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('la categoría', id)) : ok(undefined);
  }

  async reorder(ids: readonly string[]): Promise<Result<void>> {
    const now = nowIsoTimestamp();
    const result = await this.db.transaction(
      ids.map((id, i) => stmt('UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?', i, now, id)),
    );
    return result.ok ? ok(undefined) : result;
  }
}
