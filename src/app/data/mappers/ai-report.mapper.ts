import { dbError } from '../../core/errors/app-error';
import type { AiReport, Finding, Recommendation } from '../../core/types/ai-report';
import { isIsoDate } from '../../core/types/iso-date';
import { tryMoney } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import { parseJsonColumn } from './json';

export interface AiReportRow {
  readonly id: string;
  readonly week_start: string;
  readonly week_end: string;
  readonly model: string;
  readonly generated_at: string;
  readonly status: string;
  readonly verdict: string | null;
  readonly findings: string;
  readonly recommendations: string;
  readonly savings_potential_cents: number;
  readonly duration_ms: number | null;
  readonly error: string | null;
}

export const AI_REPORT_COLUMNS =
  'id, week_start, week_end, model, generated_at, status, verdict, findings, recommendations, savings_potential_cents, duration_ms, error';

export function rowToAiReport(row: AiReportRow): Result<AiReport> {
  if (!isIsoDate(row.week_start) || !isIsoDate(row.week_end)) {
    return err(dbError(`Semana inválida en ai_reports.${row.id}`));
  }
  if (row.status !== 'completed' && row.status !== 'failed') {
    return err(dbError(`Estado desconocido en ai_reports.${row.id}: ${row.status}`));
  }
  const findings = parseJsonColumn<Finding[]>(row.findings, 'ai_reports.findings');
  if (!findings.ok) return findings;
  const recommendations = parseJsonColumn<Recommendation[]>(row.recommendations, 'ai_reports.recommendations');
  if (!recommendations.ok) return recommendations;
  const savings = tryMoney(row.savings_potential_cents, 'savings_potential_cents');
  if (!savings.ok) return savings;
  return ok({
    id: row.id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    model: row.model,
    generatedAt: row.generated_at,
    status: row.status,
    verdict: row.verdict,
    findings: findings.value ?? [],
    recommendations: recommendations.value ?? [],
    savingsPotentialCents: savings.value,
    durationMs: row.duration_ms,
    error: row.error,
  });
}
