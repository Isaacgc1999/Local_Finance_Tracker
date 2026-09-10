import { CURRENCIES, activeCurrency, currencyPlural, formatMoney } from '../../core/format/money-format';
import { money } from '../../core/types/money';
import type { WeeklySummary } from './weekly-summary.builder';

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/**
 * Instrucciones del sistema: español, concreto y numérico, sin moralizar,
 * priorizando por impacto económico real y sin inventar cifras que no estén
 * en el contexto. Todos los importes van y vuelven en céntimos enteros.
 *
 * Es una función, no una constante, porque nombra la moneda activa.
 */
export function systemPrompt(): string {
  const { plural, symbol } = CURRENCIES[activeCurrency()];
  return [
  'Eres el analista financiero personal de una app de escritorio española llamada Fintrack.',
  'Analizas UNA semana de finanzas personales a partir del resumen JSON que te da el usuario.',
  '',
  'Reglas que no puedes romper:',
  '1. Escribe siempre en español de España, en segunda persona («gastaste», «tienes»).',
  '2. Sé concreto y numérico: cada afirmación lleva una cifra tomada del resumen.',
  '3. No inventes datos. Si una cifra no está en el resumen, no la menciones.',
  '4. No moralices ni juzgues («deberías ser más responsable» está prohibido). Describe y propone.',
  '5. Ordena hallazgos y recomendaciones por impacto económico real, de mayor a menor.',
  `6. Los CAMPOS numéricos van en céntimos enteros, sin decimales ni símbolo: 26,50 ${symbol} se escribe 2650.`,
  `   En el TEXTO que lee la persona escribe siempre ${plural} con formato español: «26,50 ${symbol}».`,
  '   Nunca escribas la palabra «céntimos» ni un número en céntimos dentro de una frase.',
  '7. `monthly_impact_cents` de una recomendación es lo que se AHORRA al mes: siempre positivo.',
  '   `savings_potential_cents` es la suma de esos impactos, y tampoco es negativo nunca.',
  '8. `amount_cents` de cada hallazgo es el importe del que habla ese hallazgo.',
  '9. Entre 2 y 3 hallazgos y entre 2 y 3 recomendaciones. Nada de relleno.',
  '   Sé breve: el detalle de un hallazgo y la justificación de una recomendación caben en una frase.',
  '10. `verdict` es una sola frase que explique qué define la semana.',
  '',
  'Responde ÚNICAMENTE con el objeto JSON del esquema pedido, sin texto alrededor.',
].join('\n');
}

/** El resumen compacto va como JSON en el turno del usuario. */
export function userPrompt(summary: WeeklySummary): string {
  return [
    `Analiza la semana ${summary.week_label}.`,
    'Resumen de la semana (importes en céntimos):',
    JSON.stringify(summary, null, 0),
    '',
    formattedAmounts(summary),
  ].join('\n');
}

/**
 * Las mismas cifras del resumen, ya escritas en euros. Un modelo de 8B falla
 * al convertir céntimos a euros dentro de una frase (escribe «21.574 euros»
 * en vez de «215,74 €»), pero copia bien un texto que ya le damos hecho.
 * Los campos numéricos que devuelve siguen siendo céntimos: esto es solo
 * para la prosa.
 */
function formattedAmounts(summary: WeeklySummary): string {
  const lines = [
    `Importes ya escritos en ${currencyPlural()}. Cuando cites una de estas cifras en el texto, cópiala tal cual:`,
    `- Gastos de la semana: ${formatMoney(money(summary.expenses_cents))}`,
    `- Ingresos: ${formatMoney(money(summary.income_cents))}`,
    `- Balance: ${formatMoney(money(summary.balance_cents), { sign: 'always' })}`,
    `- Media de gasto de las 4 semanas previas: ${formatMoney(money(summary.expenses_avg_4w_cents))}`,
    `- Suscripciones al mes: ${formatMoney(money(summary.subscriptions_monthly_cents))}`,
  ];
  if (summary.monthly_budget_cents !== null) {
    lines.push(`- Presupuesto mensual de gasto total: ${formatMoney(money(summary.monthly_budget_cents))}`);
  }
  for (const c of summary.by_category) {
    lines.push(`- Categoría ${c.name}: ${formatMoney(money(c.total_cents))} en ${c.count} movimiento${c.count === 1 ? '' : 's'}`);
  }
  for (const e of summary.top_expenses) {
    lines.push(`- Gasto «${e.concept}» (${e.category}): ${formatMoney(money(e.amount_cents))}`);
  }
  for (const s of summary.active_subscriptions) {
    lines.push(`- Suscripción «${s.name}»: ${formatMoney(money(s.amount_cents))} ${s.frequency}`);
  }
  return lines.join('\n');
}

/**
 * Mensajes del turno. En el reintento se añaden la respuesta fallida y el
 * error concreto, para que el modelo se corrija en vez de repetirlo.
 */
export function buildMessages(summary: WeeklySummary, retry?: { readonly rawAnswer: string; readonly error: string }): readonly ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: userPrompt(summary) },
  ];
  if (retry) {
    messages.push({ role: 'assistant', content: retry.rawAnswer.slice(0, 4000) });
    messages.push({
      role: 'user',
      content: [
        'Esa respuesta no es válida:',
        retry.error,
        '',
        'Devuelve SOLO el objeto JSON corregido, con todos los campos del esquema y los importes en céntimos enteros.',
      ].join('\n'),
    });
  }
  return messages;
}
