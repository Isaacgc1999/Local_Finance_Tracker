import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import type { ChatRequest, ChatResult, OllamaClient } from '../../infra/ollama/ollama.client';
import { AI_TIMEOUT_MS, generateWeeklyReport } from './ai.service';
import type { WeeklySummary } from './weekly-summary.builder';

const summary: WeeklySummary = {
  week: 36,
  week_label: 'Semana 36 · 31 ago–6 sep 2026',
  from: isoDate(2026, 8, 31),
  to: isoDate(2026, 9, 6),
  currency: 'EUR',
  income_cents: 275_268,
  expenses_cents: 39_990,
  balance_cents: 235_278,
  savings_rate_pct: 85.5,
  saving_cents: 40_000,
  investment_cents: 0,
  movements: 6,
  expenses_avg_4w_cents: 13_500,
  expenses_change_vs_avg_pct: 196.2,
  by_kind_cents: { Fijo: 0, Variable: 11_741, Ocio: 26_850, Suscripciones: 1_399 },
  by_category: [],
  top_expenses: [],
  active_subscriptions: [],
  subscriptions_monthly_cents: 1_399,
  deviations: [],
  monthly_budget_cents: money(175_000),
};

const valido = JSON.stringify({
  verdict: 'Semana cara por un solo motivo: el viaje.',
  findings: [{ title: 'Ocio se ha triplicado', detail: '268,50 € frente a 50,00 €.', amount_cents: 26_850, severity: 'high' }],
  recommendations: [{ action: 'Tope de ocio', rationale: 'Evita repetir el pico', monthly_impact_cents: 6_820, effort: 'low' }],
  savings_potential_cents: 6_820,
});

/** Cliente falso: devuelve las respuestas en orden y guarda las llamadas. */
function fakeClient(respuestas: readonly Result<ChatResult>[]): OllamaClient & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  let i = 0;
  return {
    calls,
    async warmUp() {
      /* sin red en los tests */
    },
    async ping() {
      return ok({ latencyMs: 1 });
    },
    async listModels() {
      return ok(['llama3.1:8b']);
    },
    async chat(request: ChatRequest) {
      calls.push(request);
      return respuestas[Math.min(i++, respuestas.length - 1)] ?? err({ kind: 'ollama', reason: 'http', message: 'sin respuesta' });
    },
  } as OllamaClient & { calls: ChatRequest[] };
}

const chat = (text: string): Result<ChatResult> => ok({ text, durationMs: 1200, evalCount: 300 });

const input = (client: OllamaClient) => ({ client, args: { summary, endpoint: 'http://127.0.0.1:11434', model: 'llama3.1:8b' } });

describe('generateWeeklyReport', () => {
  it('a la primera: informe completo con la semana del resumen', async () => {
    const client = fakeClient([chat(valido)]);
    const { args } = input(client);
    const result = await generateWeeklyReport(client, args);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.retried).toBe(false);
    const r = result.value.report;
    expect(r.status).toBe('completed');
    expect(r.weekStart).toBe('2026-08-31');
    expect(r.weekEnd).toBe('2026-09-06');
    expect(r.verdict).toContain('viaje');
    expect(r.savingsPotentialCents).toBe(6_820);
    expect(r.model).toBe('llama3.1:8b');
    expect(r.summaryInput).toBe(summary); // se guarda el contexto exacto enviado
    // Se envía el esquema y el tiempo límite del handoff.
    expect(client.calls[0]?.timeoutMs).toBe(AI_TIMEOUT_MS);
    expect(client.calls[0]?.schema).toHaveProperty('properties.verdict');
  });

  it('reintenta una vez inyectando el error y acepta la segunda', async () => {
    const client = fakeClient([chat('lo siento, no puedo'), chat(valido)]);
    const result = await generateWeeklyReport(client, input(client).args);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.retried).toBe(true);
    expect(result.value.report.status).toBe('completed');
    expect(client.calls).toHaveLength(2);
    const segundo = client.calls[1]?.messages ?? [];
    expect(segundo).toHaveLength(4);
    expect(segundo[3]?.content).toContain('JSON');
  });

  it('si falla dos veces guarda el informe como fallido, sin lanzar', async () => {
    const client = fakeClient([chat('no'), chat('tampoco')]);
    const result = await generateWeeklyReport(client, input(client).args);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const r = result.value.report;
    expect(r.status).toBe('failed');
    expect(r.findings).toEqual([]);
    expect(r.savingsPotentialCents).toBe(0);
    expect(r.error).toContain('inválido dos veces');
    expect(client.calls).toHaveLength(2);
  });

  it('Ollama caído o modelo ausente: informe fallido con el mensaje del error', async () => {
    const caido = fakeClient([err({ kind: 'ollama', reason: 'not_detected', message: 'No se encuentra Ollama en 127.0.0.1:11434' })]);
    const r1 = await generateWeeklyReport(caido, input(caido).args);
    expect(r1.ok && r1.value.report.status).toBe('failed');
    expect(r1.ok && r1.value.report.error).toContain('No se encuentra Ollama');
    expect(caido.calls).toHaveLength(1); // no reintenta si no hay servicio

    const sinModelo = fakeClient([err({ kind: 'ollama', reason: 'model_missing', message: 'El modelo «llama3.1:8b» no está descargado. Ejecuta: ollama pull llama3.1:8b' })]);
    const r2 = await generateWeeklyReport(sinModelo, input(sinModelo).args);
    expect(r2.ok && r2.value.report.error).toContain('ollama pull');

    const lento = fakeClient([err({ kind: 'ollama', reason: 'timeout', message: 'Ollama dejó de responder a los 30 s.' })]);
    const r3 = await generateWeeklyReport(lento, input(lento).args);
    expect(r3.ok && r3.value.report.error).toContain('30 s');
  });
});
