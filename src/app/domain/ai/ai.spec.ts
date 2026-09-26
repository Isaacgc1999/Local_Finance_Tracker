import { SYSTEM_CATEGORY, type Category } from '../../core/types/category';
import type { Event, EventType } from '../../core/types/event';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import type { Recurrence } from '../../core/types/recurrence';
import { buildMessages } from './prompt';
import { extractJsonObject, parseReport } from './report-parser';
import { reportJsonSchema } from './report-schema';
import { buildWeeklySummary } from './weekly-summary.builder';

let n = 0;
const ev = (type: EventType, cents: number, date: string, categoryId: string | null = null, concept = `Mov ${++n}`): Event => ({
  id: `e${n}`,
  type,
  amountCents: money(cents),
  date: date as never,
  concept,
  categoryId,
  nature: type === 'expense' ? 'variable' : null,
  paymentMethod: null,
  notes: null,
  attachmentPath: null,
  recurrenceId: null, accountId: null,
  meta: null,
  createdAt: '',
  updatedAt: '',
});

const categories = new Map<string, Category>([
  [SYSTEM_CATEGORY.alimentacion, { id: SYSTEM_CATEGORY.alimentacion, name: 'Alimentación', icon: null, color: '#F45B5B', kind: 'expense', isSystem: true, sortOrder: 0 }],
  [SYSTEM_CATEGORY.ocio, { id: SYSTEM_CATEGORY.ocio, name: 'Ocio', icon: null, color: '#6E56F8', kind: 'expense', isSystem: true, sortOrder: 3 }],
]);

const suscripcion = (concept: string, cents: number, frequency: Recurrence['frequency'] = 'monthly'): Recurrence => ({
  id: `r-${concept}`,
  type: 'subscription',
  amountCents: money(cents),
  categoryId: null,
  concept,
  frequency,
  interval: 1,
  dayOfMonth: 14,
  weekday: null,
  startDate: isoDate(2026, 1, 14),
  endDate: null,
  active: true,
  paymentMethod: null,
  accountId: null,
  meta: null,
  createdAt: '',
  updatedAt: '',
});

// Semana 36 de 2026: lunes 31 ago – domingo 6 sep.
const semana = [
  ev('income', 275_268, '2026-09-05', null, 'Nómina Grupo Aldara'),
  ev('expense', 26_850, '2026-09-05', SYSTEM_CATEGORY.ocio, 'Viaje a Oporto'),
  ev('expense', 7_241, '2026-09-02', SYSTEM_CATEGORY.alimentacion, 'Mercadona'),
  ev('expense', 4_500, '2026-09-04', SYSTEM_CATEGORY.alimentacion, 'Mercadona'),
  ev('subscription', 1_399, '2026-09-01', null, 'Netflix Estándar'),
  ev('saving', 40_000, '2026-09-06', null, 'Traspaso a cuenta ahorro'),
];
const previas = [
  [ev('expense', 8_000, '2026-08-03', SYSTEM_CATEGORY.alimentacion), ev('expense', 5_000, '2026-08-05', SYSTEM_CATEGORY.ocio)],
  [ev('expense', 9_000, '2026-08-10', SYSTEM_CATEGORY.alimentacion), ev('expense', 4_000, '2026-08-12', SYSTEM_CATEGORY.ocio)],
  [ev('expense', 7_000, '2026-08-17', SYSTEM_CATEGORY.alimentacion), ev('expense', 6_000, '2026-08-19', SYSTEM_CATEGORY.ocio)],
  [ev('expense', 10_000, '2026-08-24', SYSTEM_CATEGORY.alimentacion), ev('expense', 5_000, '2026-08-26', SYSTEM_CATEGORY.ocio)],
];

const summary = buildWeeklySummary({
  weekStart: isoDate(2026, 9, 2),
  events: semana,
  previousWeeks: previas,
  activeSubscriptions: [suscripcion('Netflix Estándar', 1_399), suscripcion('Amazon Prime', 4_995, 'yearly')],
  categories,
  budgetTargetCents: money(175_000),
});

describe('buildWeeklySummary', () => {
  it('resume la semana con importes en céntimos y sin movimientos en crudo', () => {
    expect(summary.week).toBe(36);
    expect(summary.from).toBe('2026-08-31');
    expect(summary.to).toBe('2026-09-06');
    expect(summary.income_cents).toBe(275_268);
    expect(summary.expenses_cents).toBe(26_850 + 7_241 + 4_500 + 1_399);
    expect(summary.balance_cents).toBe(275_268 - 39_990);
    expect(summary.saving_cents).toBe(40_000);
    expect(summary.movements).toBe(6);
    expect(summary.savings_rate_pct).toBeCloseTo(85.47, 1);
    // El contexto no contiene identificadores ni notas de los movimientos.
    const json = JSON.stringify(summary);
    expect(json).not.toContain('"id"');
    expect(json).not.toContain('recurrenceId');
  });

  it('compara cada categoría con su media de las 4 semanas previas', () => {
    const ocio = summary.by_category.find((c) => c.name === 'Ocio');
    const alimentacion = summary.by_category.find((c) => c.name === 'Alimentación');
    expect(ocio?.total_cents).toBe(26_850);
    expect(ocio?.avg_4w_cents).toBe(5_000);
    expect(ocio?.change_pct).toBeCloseTo(437, 0);
    expect(alimentacion?.count).toBe(2);
    expect(alimentacion?.avg_4w_cents).toBe(8_500);
    expect(summary.expenses_avg_4w_cents).toBe(13_500);
    expect(summary.expenses_change_vs_avg_pct).toBeGreaterThan(100);
  });

  it('detecta desviaciones y normaliza suscripciones a coste mensual', () => {
    expect(summary.deviations.map((d) => d.what)).toContain('Ocio');
    expect(summary.deviations.map((d) => d.what)).toContain('Gasto único dominante');
    expect(summary.active_subscriptions.map((s) => s.name)).toEqual(['Amazon Prime', 'Netflix Estándar']);
    expect(summary.subscriptions_monthly_cents).toBe(1_399 + Math.round(4_995 / 12));
    expect(summary.top_expenses[0]?.concept).toBe('Viaje a Oporto');
    expect(summary.by_kind_cents['Ocio']).toBe(26_850);
  });

  it('sin ingresos la tasa de ahorro es null, nunca NaN', () => {
    const sinIngresos = buildWeeklySummary({
      weekStart: isoDate(2026, 9, 2),
      events: [ev('expense', 1_000, '2026-09-02', SYSTEM_CATEGORY.alimentacion)],
      previousWeeks: [],
      activeSubscriptions: [],
      categories,
      budgetTargetCents: money(175_000),
    });
    expect(sinIngresos.savings_rate_pct).toBeNull();
    expect(sinIngresos.expenses_change_vs_avg_pct).toBeNull();
    expect(sinIngresos.by_category[0]?.change_pct).toBeNull();
  });
});

describe('prompt', () => {
  it('manda el resumen y, al reintentar, el error concreto', () => {
    const base = buildMessages(summary);
    expect(base).toHaveLength(2);
    expect(base[0]?.role).toBe('system');
    expect(base[0]?.content).toContain('español de España');
    // Los campos numéricos viajan en céntimos; la prosa, en euros.
    expect(base[0]?.content).toContain('céntimos enteros');
    expect(base[0]?.content).toContain('euros con formato español');
    expect(base[1]?.content).toContain('"week":36');
    // El turno del usuario incluye las cifras ya formateadas para que las copie
    // en vez de convertirlas él, que es donde un modelo pequeño se equivoca.
    expect(base[1]?.content).toContain('Importes ya escritos en euros');
    expect(base[1]?.content).toMatch(/Gastos de la semana: [\d.]+,\d{2} €/);

    const retry = buildMessages(summary, { rawAnswer: '{"verdict":', error: 'falta findings' });
    expect(retry).toHaveLength(4);
    expect(retry[2]?.role).toBe('assistant');
    expect(retry[3]?.content).toContain('falta findings');
  });

  it('el JSON Schema enviado a Ollama exige todos los campos', () => {
    const schema = reportJsonSchema() as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(schema.properties).sort()).toEqual(['findings', 'recommendations', 'savings_potential_cents', 'verdict']);
    expect(schema.required.sort()).toEqual(['findings', 'recommendations', 'savings_potential_cents', 'verdict']);
  });
});

const valido = {
  verdict: 'Semana cara por un solo motivo: el viaje.',
  findings: [{ title: 'Ocio se ha triplicado', detail: '268,50 € frente a 50,00 € de media.', amount_cents: 26_850, severity: 'high' }],
  recommendations: [{ action: 'Fijar tope de ocio', rationale: 'Evita repetir el pico', monthly_impact_cents: 6_820, effort: 'low' }],
  savings_potential_cents: 6_820,
};

describe('parseReport', () => {
  it('acepta JSON limpio y también envuelto en texto o vallas de código', () => {
    expect(parseReport(JSON.stringify(valido)).ok).toBe(true);
    const conVallas = '```json\n' + JSON.stringify(valido) + '\n```';
    expect(parseReport(conVallas).ok).toBe(true);
    const conTexto = 'Claro, aquí tienes el informe:\n' + JSON.stringify(valido) + '\nEspero que te sirva.';
    const r = parseReport(conTexto);
    expect(r.ok && r.value.verdict).toBe(valido.verdict);
  });

  it('extrae el objeto respetando llaves dentro de cadenas', () => {
    const raw = '{"verdict":"un {pico} raro","findings":[],"recommendations":[],"savings_potential_cents":0} sobra';
    expect(extractJsonObject(raw)).toBe('{"verdict":"un {pico} raro","findings":[],"recommendations":[],"savings_potential_cents":0}');
    expect(extractJsonObject('sin json aquí')).toBeNull();
  });

  it('rechaza campos que faltan o tipos que no cuadran, con el error que se reinyecta', () => {
    const sinFindings = parseReport(JSON.stringify({ ...valido, findings: [] }));
    expect(sinFindings.ok).toBe(false);
    if (!sinFindings.ok) expect(sinFindings.error.message).toContain('findings');

    const importeDecimal = parseReport(JSON.stringify({ ...valido, savings_potential_cents: 68.2 }));
    expect(importeDecimal.ok).toBe(false);

    const severidadInventada = parseReport(JSON.stringify({ ...valido, findings: [{ ...valido.findings[0], severity: 'catastrófica' }] }));
    expect(severidadInventada.ok).toBe(false);

    expect(parseReport('lo siento, no puedo').ok).toBe(false);
    expect(parseReport('{"verdict": roto}').ok).toBe(false);
  });

  it('corrige incoherencias típicas del modelo', () => {
    const raro = parseReport(
      JSON.stringify({
        ...valido,
        findings: [{ ...valido.findings[0], amount_cents: -26_850 }],
        savings_potential_cents: 0,
        recommendations: [
          { action: 'Cancelar gimnasio', rationale: 'sin uso', monthly_impact_cents: 3_490, effort: 'low' },
          { action: 'Subir aportación', rationale: 'invertir más', monthly_impact_cents: -7_000, effort: 'medium' },
        ],
      }),
    );
    expect(raro.ok).toBe(true);
    if (!raro.ok) return;
    expect(raro.value.findings[0]?.amount_cents).toBe(26_850); // importe siempre positivo
    // El impacto de una recomendación es un ahorro: nunca negativo. Llama 3.1
    // lo devuelve con signo de gasto y dejaba el potencial de ahorro en cero.
    expect(raro.value.recommendations.map((r) => r.monthly_impact_cents)).toEqual([3_490, 7_000]);
    expect(raro.value.savings_potential_cents).toBe(10_490);
  });
});
