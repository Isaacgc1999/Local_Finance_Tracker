import { z } from 'zod';

/**
 * Esquema estricto de la respuesta del modelo. Es la única fuente de verdad:
 * de aquí sale el JSON Schema que se envía a Ollama en `format` (structured
 * outputs) y la validación con la que se acepta o se rechaza la respuesta.
 */
export const SEVERITIES = ['low', 'medium', 'high'] as const;
export const EFFORTS = ['low', 'medium', 'high'] as const;

/*
 * Los límites de longitud y de elementos no son solo validación: Ollama
 * convierte este esquema en una gramática y el modelo no puede escribir más
 * allá. Como la generación es dos tercios del tiempo del informe (medido con
 * scripts/ai-bench.spec.ts), acotarla es lo que más lo acelera.
 */
export const findingSchema = z.object({
  title: z.string().min(1).max(60),
  detail: z.string().min(1).max(140),
  amount_cents: z.number().int(),
  severity: z.enum(SEVERITIES),
});

export const recommendationSchema = z.object({
  action: z.string().min(1).max(60),
  rationale: z.string().min(1).max(120),
  monthly_impact_cents: z.number().int(),
  effort: z.enum(EFFORTS),
});

export const reportSchema = z.object({
  verdict: z.string().min(1).max(160),
  findings: z.array(findingSchema).min(1).max(3),
  recommendations: z.array(recommendationSchema).min(1).max(3),
  savings_potential_cents: z.number().int().nonnegative(),
});

export type ReportPayload = z.infer<typeof reportSchema>;

/** JSON Schema que viaja en `format` para forzar la salida del modelo. */
export function reportJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(reportSchema, { target: 'draft-7' }) as Record<string, unknown>;
}
