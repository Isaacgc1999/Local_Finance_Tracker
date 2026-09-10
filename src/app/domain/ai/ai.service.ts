import { type AppError, describeError } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import type { AiReport, AiReportUpsert, Finding, Recommendation } from '../../core/types/ai-report';
import { type IsoDate, endOfIsoWeek, nowIsoTimestamp, startOfIsoWeek } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import type { OllamaClient } from '../../infra/ollama/ollama.client';
import { buildMessages } from './prompt';
import { parseReport } from './report-parser';
import { reportJsonSchema } from './report-schema';
import type { WeeklySummary } from './weekly-summary.builder';

/**
 * Tiempo sin recibir texto tras el que se da el modelo por colgado. NO es la
 * duracion maxima del informe: un modelo local escribe a unos pocos tokens por
 * segundo y un informe completo puede pasar del minuto, asi que el reloj se
 * reinicia con cada fragmento (ADR-063).
 */
export const AI_TIMEOUT_MS = 30_000;

/**
 * Silencio admitido antes del primer token: Ollama carga el modelo en memoria
 * y procesa el prompt entero antes de escribir nada, y en CPU eso pasa del
 * minuto. Medido en esta maquina: 11 s de carga y unos 7 tokens por segundo.
 */
export const AI_FIRST_CHUNK_MS = 180_000;

/** Tope absoluto de una generacion, por si el modelo entra en bucle. */
export const AI_MAX_MS = 8 * 60_000;

/**
 * Parámetros del modelo en cada petición. Viven aquí, y no en el cliente, para
 * que `scripts/ai-bench.spec.ts` mida exactamente lo que hace la app.
 */
export const AI_REQUEST_OPTIONS = {
  // Medido (scripts/ai-bench.spec.ts): 1.100 tokens de prompt y ~550 de
  // respuesta, a unos 5 tokens/s en CPU. La generación es dos tercios del
  // tiempo, así que se acota la salida con `num_predict` y con los límites de
  // longitud del esquema. 4096 de contexto cubre prompt + respuesta con margen.
  // num_predict es solo una red de seguridad contra bucles: la respuesta
  // válida más larga que permite el esquema ronda los 520 tokens, y cortar
  // antes deja el JSON a medias (reintento o informe fallido).
  options: { temperature: 0.2, num_ctx: 4096, num_predict: 700 },
  // El modelo queda 30 min en memoria: el siguiente informe no paga la carga.
  keep_alive: '30m',
} as const;

export interface GenerateInput {
  readonly summary: WeeklySummary;
  readonly endpoint: string;
  readonly model: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (partial: string, chunks: number) => void;
}

export interface GenerateOutcome {
  readonly report: AiReportUpsert;
  /** Hubo que reintentar porque la primera respuesta no validó. */
  readonly retried: boolean;
}

/**
 * Genera el informe semanal: llama al modelo, valida con Zod y, si falla,
 * reintenta UNA vez inyectando el error en el prompt. Si vuelve a fallar
 * devuelve un informe con estado `failed`, para que la pantalla muestre el
 * fallback con las métricas calculadas en local. La app nunca se rompe
 * porque el modelo alucine.
 */
export async function generateWeeklyReport(client: OllamaClient, input: GenerateInput): Promise<Result<GenerateOutcome>> {
  const weekStart = startOfIsoWeek(input.summary.from);
  const weekEnd = endOfIsoWeek(weekStart);
  const schema = reportJsonSchema();
  const started = Date.now();

  const call = (retry?: { rawAnswer: string; error: string }) =>
    client.chat({
      endpoint: input.endpoint,
      model: input.model,
      messages: buildMessages(input.summary, retry),
      schema,
      timeoutMs: AI_TIMEOUT_MS,
      firstChunkMs: AI_FIRST_CHUNK_MS,
      maxMs: AI_MAX_MS,
      requestOptions: AI_REQUEST_OPTIONS,
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.onProgress ? { onToken: input.onProgress } : {}),
    });

  const first = await call();
  if (!first.ok) return failed(first.error, weekStart, weekEnd, input, Date.now() - started);

  const parsed = parseReport(first.value.text);
  if (parsed.ok) {
    return ok({ report: toReport(parsed.value, weekStart, weekEnd, input, first.value.durationMs), retried: false });
  }

  // Segundo intento con el error concreto delante del modelo.
  const second = await call({ rawAnswer: first.value.text, error: parsed.error.message });
  if (!second.ok) return failed(second.error, weekStart, weekEnd, input, Date.now() - started);

  const reparsed = parseReport(second.value.text);
  if (reparsed.ok) {
    return ok({ report: toReport(reparsed.value, weekStart, weekEnd, input, Date.now() - started), retried: true });
  }

  return failed(
    { kind: 'ollama', reason: 'invalid_json', message: `El modelo devolvió un informe inválido dos veces. ${reparsed.error.message}` },
    weekStart,
    weekEnd,
    input,
    Date.now() - started,
  );
}

function toReport(
  payload: { verdict: string; findings: readonly Finding[]; recommendations: readonly Recommendation[]; savings_potential_cents: number },
  weekStart: IsoDate,
  weekEnd: IsoDate,
  input: GenerateInput,
  durationMs: number,
): AiReportUpsert {
  return {
    id: uuidV7(),
    weekStart,
    weekEnd,
    model: input.model,
    generatedAt: nowIsoTimestamp(),
    status: 'completed',
    verdict: payload.verdict,
    findings: payload.findings,
    recommendations: payload.recommendations,
    savingsPotentialCents: money(payload.savings_potential_cents),
    durationMs,
    error: null,
    summaryInput: input.summary,
  };
}

/** El informe fallido también se guarda: la timeline lo muestra con «Reintentar». */
function failed(error: AppError, weekStart: IsoDate, weekEnd: IsoDate, input: GenerateInput, durationMs: number): Result<GenerateOutcome> {
  const report: AiReportUpsert = {
    id: uuidV7(),
    weekStart,
    weekEnd,
    model: input.model,
    generatedAt: nowIsoTimestamp(),
    status: 'failed',
    verdict: null,
    findings: [],
    recommendations: [],
    savingsPotentialCents: money(0),
    durationMs,
    error: describeError(error),
    summaryInput: input.summary,
  };
  return ok({ report, retried: false });
}

/** Suma de los impactos positivos que aún no se han aplicado. */
export function pendingSavings(report: AiReport | null): number {
  if (!report) return 0;
  return report.recommendations.filter((r) => !r.applied).reduce((acc, r) => acc + Math.max(0, r.monthly_impact_cents), 0);
}

export function appliedSavings(report: AiReport | null): number {
  if (!report) return 0;
  return report.recommendations.filter((r) => r.applied).reduce((acc, r) => acc + Math.max(0, r.monthly_impact_cents), 0);
}

/** Error tipado a partir de un informe fallido, para pintar el estado correcto. */
export function errorOf(report: AiReport): string {
  return report.error ?? 'No se pudo generar el informe.';
}

export function isFailed(report: AiReport | null): boolean {
  return report?.status === 'failed';
}

export function unwrapErr<T>(r: Result<T>): AppError | null {
  return r.ok ? null : r.error;
}

export function unwrapOkOrNull<T>(r: Result<T>): T | null {
  return r.ok ? r.value : null;
}

export function toErr<T>(error: AppError): Result<T> {
  return err(error);
}
