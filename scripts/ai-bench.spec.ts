/**
 * Mide el informe de IA contra un Ollama REAL: carga del modelo, lectura del
 * prompt y generación, por separado. Se salta en `npm run test:node`; se
 * ejecuta a mano:
 *
 *   FT_AI_BENCH=1 npx vitest run --config vitest.node.config.ts scripts/ai-bench.spec.ts
 *
 * Variables opcionales: FT_AI_MODEL (llama3.1:8b), FT_AI_ENDPOINT
 * (http://127.0.0.1:11434).
 */
import type { Category } from '../src/app/core/types/category';
import type { Event, EventType } from '../src/app/core/types/event';
import { type IsoDate, addDays, addWeeks, startOfIsoWeek, todayIso } from '../src/app/core/types/iso-date';
import { money } from '../src/app/core/types/money';
import { SEED_CATEGORIES } from '../src/app/data/db/migrations/0002-seed-categories';
import { AI_REQUEST_OPTIONS } from '../src/app/domain/ai/ai.service';
import { buildMessages } from '../src/app/domain/ai/prompt';
import { parseReport } from '../src/app/domain/ai/report-parser';
import { reportJsonSchema } from '../src/app/domain/ai/report-schema';
import { buildWeeklySummary } from '../src/app/domain/ai/weekly-summary.builder';

const RUN = !!process.env['FT_AI_BENCH'];
const MODEL = process.env['FT_AI_MODEL'] ?? 'llama3.1:8b';
const ENDPOINT = process.env['FT_AI_ENDPOINT'] ?? 'http://127.0.0.1:11434';

let seq = 0;
function evento(type: EventType, cents: number, date: IsoDate, concept: string, categoryId: string | null): Event {
  seq++;
  return {
    id: `bench-${seq}`,
    type,
    amountCents: money(cents),
    date,
    concept,
    categoryId,
    nature: type === 'expense' ? 'variable' : null,
    paymentMethod: 'Tarjeta',
    notes: null,
    attachmentPath: null,
    recurrenceId: null,
    meta: null,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
  };
}

/** Una semana corriente: compra, gasolina, ocio, una suscripción y la nómina. */
function semana(lunes: IsoDate, factor: number): Event[] {
  return [
    evento('expense', Math.round(4860 * factor), lunes, 'Mercadona', 'cat-alimentacion'),
    evento('expense', Math.round(7215 * factor), addDays(lunes, 2), 'Compra semanal', 'cat-alimentacion'),
    evento('subscription', 1399, addDays(lunes, 3), 'Netflix Estándar', 'cat-ocio'),
    evento('expense', Math.round(5420 * factor), addDays(lunes, 4), 'Gasolinera', 'cat-transporte'),
    evento('expense', Math.round(2680 * factor), addDays(lunes, 5), 'Cena con amigos', 'cat-ocio'),
  ];
}

describe.skipIf(!RUN)('informe de IA contra Ollama real', () => {
  it('mide carga, prompt y generación', async () => {
    const lunes = startOfIsoWeek(addWeeks(todayIso(), -1));
    const categories = new Map<string, Category>(
      SEED_CATEGORIES.map((c, i) => [
        c.id,
        { id: c.id, name: c.name, icon: null, color: c.color, kind: c.kind, isSystem: true, sortOrder: i },
      ]),
    );
    const summary = buildWeeklySummary({
      weekStart: lunes,
      // Importes distintos en cada ejecución, como pasa de una semana a otra:
      // así Ollama no puede reutilizar la caché del resumen y la lectura del
      // prompt se mide de verdad (la parte fija del sistema sí se reutiliza).
      events: [...semana(lunes, 1.2 + Math.random() * 0.4), evento('income', 241268, addDays(lunes, 4), 'Nómina', 'cat-nomina')],
      previousWeeks: [4, 3, 2, 1].map((n) => semana(addWeeks(lunes, -n), 0.9 + Math.random() * 0.2)),
      activeSubscriptions: [],
      categories,
      budgetTargetCents: null,
    });
    const messages = buildMessages(summary);
    const promptChars = messages.reduce((n, m) => n + m.content.length, 0);

    const started = Date.now();
    const res = await fetch(`${ENDPOINT}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
        format: reportJsonSchema(),
        ...AI_REQUEST_OPTIONS,
      }),
    });
    const body = (await res.json()) as Record<string, number | string | object>;
    const ms = (k: string) => Math.round(Number(body[k] ?? 0) / 1e6);
    const total = Date.now() - started;
    const content = (body['message'] as { content?: string } | undefined)?.content ?? '';
    const parsed = parseReport(content);
    const resumen = parsed.ok
      ? `JSON válido · ${parsed.value.findings.length} hallazgos · ${parsed.value.recommendations.length} recomendaciones`
      : `JSON NO válido`;

    console.log(
      [
        `modelo ${MODEL} · prompt ${promptChars} caracteres`,
        `carga del modelo     ${ms('load_duration')} ms`,
        `lectura del prompt   ${ms('prompt_eval_duration')} ms · ${String(body['prompt_eval_count'])} tokens`,
        `generación           ${ms('eval_duration')} ms · ${String(body['eval_count'])} tokens`,
        `total                ${total} ms`,
        `fin                  ${String(body['done_reason'])} · ${resumen}`,
      ].join('\n'),
    );
    expect(res.ok).toBe(true);
  }, 900_000);
});
