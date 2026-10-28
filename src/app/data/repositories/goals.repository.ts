import { dbError, notFound } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import { type Goal, type GoalDraft, type GoalPatch, isContributionFrequency, isGoalKind } from '../../core/types/goal';
import { type IsoDate, isIsoDate, nowIsoTimestamp } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, type SqlValue, stmt } from '../db/database';
import { mapRows } from '../mappers/json';

interface GoalRow {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly target_cents: number;
  readonly start_date: string;
  readonly target_date: string;
  readonly frequency: string;
  readonly status: string;
  readonly color: string;
  readonly notes: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

const COLUMNS = 'id, name, kind, target_cents, start_date, target_date, frequency, status, color, notes, created_at, updated_at';

function rowToGoal(row: GoalRow): Result<Goal> {
  if (!isGoalKind(row.kind)) return err(dbError(`Tipo de objetivo desconocido: ${row.kind}`));
  if (!isIsoDate(row.start_date) || !isIsoDate(row.target_date)) return err(dbError(`Fechas inválidas en goals.${row.id}`));
  const status = row.status === 'achieved' || row.status === 'archived' ? row.status : 'active';
  return ok({
    id: row.id,
    name: row.name,
    kind: row.kind,
    targetCents: money(row.target_cents),
    startDate: row.start_date,
    targetDate: row.target_date,
    frequency: isContributionFrequency(row.frequency) ? row.frequency : 'monthly',
    status,
    color: row.color,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const PATCH_COLUMNS: Readonly<Record<keyof GoalPatch, string>> = {
  name: 'name',
  kind: 'kind',
  targetCents: 'target_cents',
  startDate: 'start_date',
  targetDate: 'target_date',
  frequency: 'frequency',
  status: 'status',
  color: 'color',
  notes: 'notes',
};

/**
 * Objetivos. Crear uno crea en la misma transacción su hucha de «Ahorro
 * específico», que es donde se apunta lo ahorrado para él; borrarlo la borra
 * (ON DELETE CASCADE).
 */
export class GoalsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  async findAll(): Promise<Result<readonly Goal[]>> {
    const rows = await this.db.select<GoalRow>(
      `SELECT ${COLUMNS} FROM goals ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'achieved' THEN 1 ELSE 2 END, target_date`,
    );
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToGoal);
  }

  async findById(id: string): Promise<Result<Goal | null>> {
    const rows = await this.db.select<GoalRow>(`SELECT ${COLUMNS} FROM goals WHERE id = ?`, [id]);
    if (!rows.ok) return rows;
    const row = rows.value[0];
    return row ? rowToGoal(row) : ok(null);
  }

  /** Alta del objetivo + su hucha; si ya hay algo ahorrado, entra como primer apunte. */
  async insert(draft: GoalDraft, alreadySaved = 0, today: IsoDate = draft.startDate): Promise<Result<{ readonly goal: Goal; readonly potId: string }>> {
    const now = nowIsoTimestamp();
    const id = uuidV7();
    const potId = uuidV7();
    const statements = [
      stmt(
        `INSERT INTO goals (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        draft.name.trim(),
        draft.kind,
        draft.targetCents,
        draft.startDate,
        draft.targetDate,
        draft.frequency,
        draft.status,
        draft.color,
        draft.notes,
        now,
        now,
      ),
      stmt(
        `INSERT INTO savings_pots (id, name, kind, color, target_cents, goal_id, archived, sort_order, created_at, updated_at)
         VALUES (?, ?, 'goal', ?, ?, ?, 0, 100, ?, ?)`,
        potId,
        draft.name.trim(),
        draft.color,
        draft.targetCents,
        id,
        now,
        now,
      ),
    ];
    if (alreadySaved !== 0) {
      statements.push(
        stmt(
          'INSERT INTO pot_entries (id, pot_id, date, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          uuidV7(),
          potId,
          today,
          alreadySaved,
          'Ya ahorrado al crear el objetivo',
          now,
        ),
      );
    }
    const result = await this.db.transaction(statements);
    if (!result.ok) return result;
    return ok({ goal: { ...draft, name: draft.name.trim(), id, createdAt: now, updatedAt: now }, potId });
  }

  /** Cambia el objetivo; nombre, color y meta se copian a su hucha para que no se desincronicen. */
  async update(id: string, patch: GoalPatch): Promise<Result<Goal>> {
    const sets: string[] = [];
    const params: SqlValue[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as (keyof GoalPatch)[]) {
      if (!(key in patch)) continue;
      sets.push(`${PATCH_COLUMNS[key]} = ?`);
      const value = patch[key];
      params.push(key === 'name' && typeof value === 'string' ? value.trim() : ((value ?? null) as SqlValue));
    }
    const now = nowIsoTimestamp();
    sets.push('updated_at = ?');
    params.push(now, id);
    const potSets: string[] = [];
    const potParams: SqlValue[] = [];
    if (patch.name !== undefined) {
      potSets.push('name = ?');
      potParams.push(patch.name.trim());
    }
    if (patch.color !== undefined) {
      potSets.push('color = ?');
      potParams.push(patch.color);
    }
    if (patch.targetCents !== undefined) {
      potSets.push('target_cents = ?');
      potParams.push(patch.targetCents);
    }
    if (patch.status !== undefined) {
      potSets.push('archived = ?');
      potParams.push(patch.status === 'archived' ? 1 : 0);
    }
    const statements = [stmt(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, ...params)];
    if (potSets.length > 0) {
      statements.push(stmt(`UPDATE savings_pots SET ${potSets.join(', ')}, updated_at = ? WHERE goal_id = ?`, ...potParams, now, id));
    }
    const result = await this.db.transaction(statements);
    if (!result.ok) return result;
    const updated = await this.findById(id);
    if (!updated.ok) return updated;
    return updated.value ? ok(updated.value) : err(notFound('el objetivo', id));
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM goals WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('el objetivo', id)) : ok(undefined);
  }
}
