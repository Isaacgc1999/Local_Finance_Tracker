import { dbError } from '../../core/errors/app-error';
import { type Category, isHexColor } from '../../core/types/category';
import { type Result, err, ok } from '../../core/types/result';

export interface CategoryRow {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly color: string;
  readonly kind: string;
  readonly is_system: number;
  readonly sort_order: number;
}

export const CATEGORY_COLUMNS = 'id, name, icon, color, kind, is_system, sort_order';

export function rowToCategory(row: CategoryRow): Result<Category> {
  if (row.kind !== 'expense' && row.kind !== 'income' && row.kind !== 'both') {
    return err(dbError(`Tipo de categoría desconocido: ${row.kind}`));
  }
  if (!isHexColor(row.color)) return err(dbError(`Color inválido en categories.${row.id}`));
  return ok({
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    kind: row.kind,
    isSystem: row.is_system === 1,
    sortOrder: row.sort_order,
  });
}
