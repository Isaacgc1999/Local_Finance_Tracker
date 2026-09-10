// Servidor que imita la API de Ollama para probar la pantalla de IA sin
// tener el modelo instalado. Responde /api/version, /api/tags y /api/chat
// con streaming NDJSON, igual que Ollama.
//
// Uso: node tools/fake-ollama.mjs [puerto] [modo]
//   modo: ok (por defecto) | invalid | timeout | error500 | nomodel
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 11434);
const mode = process.argv[3] ?? 'ok';

const INFORME = {
  verdict: 'Semana cara por un solo motivo: el viaje. Sin el, habrias cerrado un 12 % por debajo de tu media.',
  findings: [
    { title: 'Ocio se ha triplicado', detail: 'Gastaste 268,50 EUR en ocio frente a una media de 50,00 EUR en las cuatro semanas anteriores. El 100 % procede de un unico cargo: el viaje a Oporto.', amount_cents: 26850, severity: 'high' },
    { title: 'La compra semanal se ha estabilizado', detail: 'Dos compras en Mercadona suman 117,41 EUR, un 38 % por encima de tu media de 85,00 EUR, pero dentro de tu rango habitual.', amount_cents: 11741, severity: 'low' },
    { title: 'Suscripciones estables', detail: 'Netflix (13,99 EUR) y Amazon Prime (4,16 EUR al mes prorrateado) suman 18,15 EUR mensuales sin cambios.', amount_cents: 1815, severity: 'medium' },
  ],
  recommendations: [
    { action: 'Fijar un tope de 180 EUR en ocio para el proximo mes', rationale: 'El viaje fue puntual; poner un tope evita que el nivel alto se consolide.', monthly_impact_cents: 6820, effort: 'low' },
    { action: 'Bajar Amazon Prime a facturacion mensual solo cuando lo uses', rationale: 'Pagas el anual completo y lo usas cuatro meses al ano.', monthly_impact_cents: 3300, effort: 'medium' },
  ],
  savings_potential_cents: 10120,
};

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  const url = (req.url ?? '').split('?')[0];

  if (url === '/api/version') {
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ version: '0.5.0-fake' }));
    return;
  }

  if (url === '/api/tags') {
    const models = mode === 'nomodel' ? [] : [{ name: 'llama3.1:8b', model: 'llama3.1:8b' }];
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ models }));
    return;
  }

  if (url === '/api/chat') {
    if (mode === 'error500') {
      res.writeHead(500, { ...cors, 'content-type': 'text/plain' });
      res.end('modelo no disponible');
      return;
    }
    if (mode === 'nomodel') {
      res.writeHead(404, { ...cors, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'model "llama3.1:8b" not found, try pulling it first' }));
      return;
    }
    res.writeHead(200, { ...cors, 'content-type': 'application/x-ndjson' });
    if (mode === 'timeout') {
      // Abre el flujo y no lo cierra nunca: la app debe cortar a los 30 s.
      res.write(JSON.stringify({ model: 'llama3.1:8b', message: { role: 'assistant', content: '{' }, done: false }) + '\n');
      return;
    }
    const payload = mode === 'invalid' ? 'Lo siento, no puedo generar ese informe.' : JSON.stringify(INFORME);
    // Trocea la respuesta como haría un modelo real.
    for (let i = 0; i < payload.length; i += 48) {
      res.write(JSON.stringify({ model: 'llama3.1:8b', message: { role: 'assistant', content: payload.slice(i, i + 48) }, done: false }) + '\n');
      await sleep(60);
    }
    res.write(JSON.stringify({ model: 'llama3.1:8b', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', eval_count: 420, total_duration: 3_400_000_000 }) + '\n');
    res.end();
    return;
  }

  res.writeHead(404, cors);
  res.end();
}).listen(port, () => console.log(`fake-ollama (${mode}) en http://127.0.0.1:${port}`));
