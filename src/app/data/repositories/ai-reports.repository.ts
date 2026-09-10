import { notFound } from '../../core/errors/app-error';
import type { AiReport, AiReportUpsert, Recommendation } from '../../core/types/ai-report';
import type { IsoDate } from '../../core/types/iso-date';
import { type Result, err, ok } from '../../core/types/result';
import { type DatabaseHandle, stmt } from '../db/database';
import { AI_REPORT_COLUMNS, type AiReportRow, rowToAiReport } from '../mappers/ai-report.mapper';
import { mapRows, toJsonColumn } from '../mappers/json';

export class AiReportsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  /** Más reciente primero (timeline). */
  async findAll(): Promise<Result<readonly AiReport[]>> {
    const rows = await this.db.select<AiReportRow>(`SELECT ${AI_REPORT_COLUMNS} FROM ai_reports ORDER BY week_start DESC`);
    if (!rows.ok) return rows;
    return mapRows(rows.value, rowToAiReport);
  }

  async findByWeek(weekStart: IsoDate): Promise<Result<AiReport | null>> {
    const rows = await this.db.select<AiReportRow>(`SELECT ${AI_REPORT_COLUMNS} FROM ai_reports WHERE week_start = ?`, [
      weekStart,
    ]);
    if (!rows.ok) return rows;
    const row = rows.value[0];
    return row ? rowToAiReport(row) : ok(null);
  }

  /** Un informe por semana: regenerar sobrescribe (conflicto en `week_start`). */
  async upsert(report: AiReportUpsert): Promise<Result<AiReport>> {
    const result = await this.db.transaction([
      stmt(
        `INSERT INTO ai_reports (${AI_REPORT_COLUMNS}, summary_input)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(week_start) DO UPDATE SET
           id = excluded.id,
           week_end = excluded.week_end,
           model = excluded.model,
           generated_at = excluded.generated_at,
           status = excluded.status,
           verdict = excluded.verdict,
           findings = excluded.findings,
           recommendations = excluded.recommendations,
           savings_potential_cents = excluded.savings_potential_cents,
           summary_input = excluded.summary_input,
           duration_ms = excluded.duration_ms,
           error = excluded.error`,
        report.id,
        report.weekStart,
        report.weekEnd,
        report.model,
        report.generatedAt,
        report.status,
        report.verdict,
        JSON.stringify(report.findings),
        JSON.stringify(report.recommendations),
        report.savingsPotentialCents,
        report.durationMs,
        report.error,
        toJsonColumn(report.summaryInput),
      ),
    ]);
    if (!result.ok) return result;
    const { summaryInput: _ignored, ...stored } = report;
    return ok(stored);
  }

  async setRecommendationApplied(id: string, index: number, applied: boolean): Promise<Result<AiReport>> {
    const rows = await this.db.select<AiReportRow>(`SELECT ${AI_REPORT_COLUMNS} FROM ai_reports WHERE id = ?`, [id]);
    if (!rows.ok) return rows;
    const row = rows.value[0];
    if (!row) return err(notFound('el informe', id));
    const current = rowToAiReport(row);
    if (!current.ok) return current;
    const recommendations: Recommendation[] = current.value.recommendations.map((r, i) =>
      i === index ? { ...r, applied } : r,
    );
    const result = await this.db.transaction([
      stmt('UPDATE ai_reports SET recommendations = ? WHERE id = ?', JSON.stringify(recommendations), id),
    ]);
    if (!result.ok) return result;
    return ok({ ...current.value, recommendations });
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await this.db.transaction([stmt('DELETE FROM ai_reports WHERE id = ?', id)]);
    if (!result.ok) return result;
    return result.value.rowsAffected === 0 ? err(notFound('el informe', id)) : ok(undefined);
  }
}
