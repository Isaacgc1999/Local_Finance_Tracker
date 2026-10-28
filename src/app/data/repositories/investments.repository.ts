import { dbError, notFound } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import {
  type Investment,
  type InvestmentDraft,
  type InvestmentPatch,
  type Valuation,
  type ValuationDraft,
  isHoldingClass,
} from '../../core/types/investment';
import { isIsoDate, nowIsoTimestamp } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, type SqlValue, stmt } from '../db/database';
import { mapRows } from '../mappers/json';

interface InvestmentRow {
  readonly id: string;
  readonly name: string;
  readonly issuer: string | null;
  readonly asset_class: string;
  readonly ticker: string | null;
  readonly units: number | null;
  readonly color: string;
  readonly archived: number;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ValuationRow {
  readonly id: string;
  readonly investment_id: string;
  readonly date: string;
  readonly market_value_cents: number;
  readonly invested_cents: number;
  readonly created_at: string;
}

const COLUMNS = 'id, name, issuer, asset_class, ticker, units, color, archived, sort_order, created_at, updated_at';
const VALUATION_COLUMNS = 'id, investment_id, date, market_value_cents, invested_cents, created_at';

function rowToInvestment(row: InvestmentRow): Result<Investment> {
  if (!isHoldingClass(row.asset_class)) return err(dbError(`Clase de activo desconocida: ${row.asset_class}`));
  return ok({
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    assetClass: row.asset_class,
    ticker: row.ticker,
    units: row.units,
    color: row.color,
    archived: row.archived === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function rowToValuation(row: ValuationRow): Result<Valuation> {
  if (!isIsoDate(row.date)) return err(dbError(`Fecha inválida en investment_valuations.${row.id}`));
  return ok({
    id: row.id,
    investmentId: row.investment_id,
    date: row.date,
    marketValueCents: money(row.market_value_cents),
    investedCents: money(row.invested_cents),
    createdAt: row.created_at,
  });
}

const PATCH_COLUMNS: Readonly<Record<keyof InvestmentPatch, string>> = {
  name: 'name',
  issuer: 'issuer',
  assetClass: 'asset_class',
  ticker: 'ticker',
  units: 'units',
  color: 'color',
  archived: 'archived',
  sortOrder: 'sort_order',
};

/** Inversiones y su historia de valoraciones (una por día y posición). */
export class InvestmentsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  async findAll(): Promise<Result<readonly Investment[]>> {
    const rows = await this.db.select<InvestmentRow>(`SELECT ${COLUMNS} FROM investments ORDER BY archived, sort_order, created_at`);
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToInvestment);
  }

  async findValuations(): Promise<Result<readonly Valuation[]>> {
    const rows = await this.db.select<ValuationRow>(`SELECT ${VALUATION_COLUMNS} FROM investment_valuations ORDER BY date, investment_id`);
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToValuation);
  }

  /** Alta de la inversión con su primera valoración (valor de hoy y lo aportado). */
  async insert(draft: InvestmentDraft, first: Omit<ValuationDraft, 'investmentId'>): Promise<Result<Investment>> {
    const now = nowIsoTimestamp();
    const id = uuidV7();
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO investments (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        draft.name.trim(),
        draft.issuer,
        draft.assetClass,
        draft.ticker,
        draft.units,
        draft.color,
        draft.archived ? 1 : 0,
        draft.sortOrder,
        now,
        now,
      ),
      stmt(
        `INSERT INTO investment_valuations (${VALUATION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
        uuidV7(),
        id,
        first.date,
        first.marketValueCents,
        first.investedCents,
        now,
      ),
    ]);
    if (!result.ok) return result;
    return ok({ ...draft, name: draft.name.trim(), id, createdAt: now, updatedAt: now });
  }

  async update(id: string, patch: InvestmentPatch): Promise<Result<void>> {
    const sets: string[] = [];
    const params: SqlValue[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as (keyof InvestmentPatch)[]) {
      if (!(key in patch)) continue;
      sets.push(`${PATCH_COLUMNS[key]} = ?`);
      const value = patch[key];
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : ((value ?? null) as SqlValue));
    }
    sets.push('updated_at = ?');
    params.push(nowIsoTimestamp(), id);
    const result = await this.db.transaction([stmt(`UPDATE investments SET ${sets.join(', ')} WHERE id = ?`, ...params)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('la inversión', id)) : ok(undefined);
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM investments WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('la inversión', id)) : ok(undefined);
  }

  /** Valoración del día: si ya había una ese día para esa inversión, se sustituye. */
  async upsertValuation(draft: ValuationDraft): Promise<Result<void>> {
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO investment_valuations (${VALUATION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(investment_id, date) DO UPDATE SET market_value_cents = excluded.market_value_cents, invested_cents = excluded.invested_cents`,
        uuidV7(),
        draft.investmentId,
        draft.date,
        draft.marketValueCents,
        draft.investedCents,
        nowIsoTimestamp(),
      ),
    ]);
    return result.ok ? ok(undefined) : result;
  }

  async deleteValuation(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM investment_valuations WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('la valoración', id)) : ok(undefined);
  }
}
