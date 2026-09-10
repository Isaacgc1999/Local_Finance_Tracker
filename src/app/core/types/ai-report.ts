import type { IsoDate } from './iso-date';
import type { Money } from './money';

export type Severity = 'low' | 'medium' | 'high';
export type Effort = 'low' | 'medium' | 'high';

/** Esquema que devuelve el modelo (nombres en snake_case, como en el prompt). */
export interface Finding {
  readonly title: string;
  readonly detail: string;
  readonly amount_cents: number;
  readonly severity: Severity;
}

export interface Recommendation {
  readonly action: string;
  readonly rationale: string;
  readonly monthly_impact_cents: number;
  readonly effort: Effort;
  /** Marcada con «Aplicar» en la UI (no viene del modelo). */
  readonly applied?: boolean;
}

export type ReportStatus = 'completed' | 'failed';

export interface AiReport {
  readonly id: string;
  /** Lunes ISO de la semana analizada. */
  readonly weekStart: IsoDate;
  readonly weekEnd: IsoDate;
  readonly model: string;
  readonly generatedAt: string;
  readonly status: ReportStatus;
  readonly verdict: string | null;
  readonly findings: readonly Finding[];
  readonly recommendations: readonly Recommendation[];
  readonly savingsPotentialCents: Money;
  readonly durationMs: number | null;
  readonly error: string | null;
}

/** Lo que se persiste además del informe: el contexto exacto que se envió al modelo. */
export interface AiReportUpsert extends AiReport {
  readonly summaryInput: unknown;
}
