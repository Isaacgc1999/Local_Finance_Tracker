import { type Result, err, ok } from '../../core/types/result';
import { type ReportPayload, reportSchema } from './report-schema';

export interface ParseFailure {
  readonly kind: 'invalid_json';
  readonly issues: readonly string[];
  /** Mensaje corto que se inyecta en el reintento. */
  readonly message: string;
}

/** Quita vallas ```json, prefijos y texto alrededor del objeto JSON. */
export function extractJsonObject(raw: string): string | null {
  const withoutFences = raw.replace(/```(?:json)?/gi, '').trim();
  const start = withoutFences.indexOf('{');
  if (start < 0) return null;
  // Recorre equilibrando llaves, ignorando las que están dentro de cadenas.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < withoutFences.length; i++) {
    const ch = withoutFences[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return withoutFences.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Convierte la respuesta del modelo en un informe validado. Tolera vallas de
 * código y texto alrededor, pero NO tolera campos que falten o tipos que no
 * cuadren: eso provoca el reintento con el error inyectado en el prompt.
 */
export function parseReport(raw: string): Result<ReportPayload, ParseFailure> {
  const json = extractJsonObject(raw);
  if (!json) {
    return err({ kind: 'invalid_json', issues: ['La respuesta no contiene ningún objeto JSON.'], message: 'La respuesta no contenía ningún objeto JSON.' });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'JSON mal formado';
    return err({ kind: 'invalid_json', issues: [detail], message: `El JSON no se pudo interpretar: ${detail}.` });
  }
  const result = reportSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'raíz'}: ${i.message}`);
    return err({ kind: 'invalid_json', issues, message: `El JSON no cumple el esquema (${issues.slice(0, 4).join('; ')}).` });
  }
  return ok(normalize(result.data));
}

/**
 * Coherencia mínima que el modelo suele fallar: importes negativos donde no
 * toca y un potencial de ahorro que no cuadra con sus recomendaciones.
 */
function normalize(payload: ReportPayload): ReportPayload {
  const findings = payload.findings.map((f) => ({ ...f, amount_cents: Math.abs(f.amount_cents) }));
  // El impacto de una recomendación es lo que se ahorra al mes, así que no
  // puede ser negativo. Llama 3.1 lo devuelve con signo de gasto a menudo, y
  // entonces el potencial de ahorro salía a cero con recomendaciones en
  // pantalla que sí tenían importe.
  const recommendations = payload.recommendations.map((r) => ({
    ...r,
    monthly_impact_cents: Math.abs(r.monthly_impact_cents),
  }));
  const positiveImpact = recommendations.reduce((acc, r) => acc + r.monthly_impact_cents, 0);
  const savings = payload.savings_potential_cents > 0 ? payload.savings_potential_cents : positiveImpact;
  return { ...payload, findings, recommendations, savings_potential_cents: Math.max(0, savings) };
}
