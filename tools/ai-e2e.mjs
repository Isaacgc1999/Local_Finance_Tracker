// Prueba de extremo a extremo de la pantalla de Análisis IA contra el
// servidor falso de Ollama: pulsa «Generar/Regenerar análisis», captura el
// estado de generación y el resultado, y vuelca el texto de la tarjeta.
// Uso: node tools/ai-e2e.mjs [salidaPng] [urlBase] [endpointOllama]
//
// El tercer argumento sirve cuando el 11434 ya está ocupado (por ejemplo por
// un Ollama real sin modelo descargado): se arranca el servidor falso en otro
// puerto y la prueba cambia el endpoint desde Ajustes antes de generar.
//   node tools/fake-ollama.mjs 11435 ok
//   node tools/ai-e2e.mjs ai.png http://localhost:4300 http://127.0.0.1:11435
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'ai.png';
const base = process.argv[3] ?? 'http://localhost:4300';
const endpoint = process.argv[4] ?? '';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9700 + Math.floor(Math.random() * 200);
const NL = String.fromCharCode(10);

const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  '--window-size=1440,1200',
  'about:blank',
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function version() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return res.json();
    } catch {
      /* arrancando */
    }
    await sleep(200);
  }
  throw new Error('Chrome no responde');
}

let id = 0;
const pending = new Map();
let ws;
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });

try {
  const { webSocketDebuggerUrl } = await version();
  ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPCION ' + JSON.stringify(msg.params).slice(0, 300));
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: base + '/dashboard' }, sessionId);
  await sleep(6000);

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (res.exceptionDetails) throw new Error(expression + ': ' + JSON.stringify(res.exceptionDetails).slice(0, 300));
    return res.result?.value;
  };
  const shot = async (path) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(path, Buffer.from(data, 'base64'));
  };

  // El informe analiza la última semana completa, que cae dentro del mes en
  // curso y por tanto arranca vacía (ver demo-window.ts). Se registra un
  // movimiento con esa fecha para que haya algo que analizar; de paso se
  // comprueba que un alta recién guardada llega al resumen semanal.
  const escribir = async (selector, valor) => {
    const js =
      '(() => { const el = document.querySelector(' +
      JSON.stringify(selector) +
      '); if (!el) return false;' +
      ' Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ' +
      JSON.stringify(valor) +
      '); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()';
    if (!(await evaluate(js))) throw new Error('no existe el campo ' + selector);
  };

  const lunesPasado = (() => {
    const d = new Date();
    const iso = (d.getDay() + 6) % 7; // 0 = lunes
    d.setDate(d.getDate() - iso - 7);
    return d.toISOString().slice(0, 10);
  })();

  // Con la semana objetivo vacía la aplicación no llama al modelo: lo dice y
  // no genera nada. Se comprueba antes de registrar el movimiento.
  await evaluate(`document.querySelector('ft-sidebar a[href="/ai"]').click()`);
  await sleep(3000);
  await evaluate(
    '(() => { const b = [...document.querySelectorAll("button")].find(x => /Generar an|Regenerar an/.test(x.textContent)); if (b) b.click(); })()',
  );
  await sleep(1200);
  const avisoVacio = await evaluate(
    '(document.querySelector(".toasts")?.textContent ?? "").trim()',
  );
  console.log('semana vacía: ' + (avisoVacio || '(sin aviso)'));

  if (endpoint) {
    await evaluate(`document.querySelector('ft-sidebar a[href="/settings"]').click()`);
    await sleep(3000);
    await escribir('ft-ajustes-ollama input.ft-input', endpoint);
    await evaluate('document.querySelector("ft-ajustes-ollama input.ft-input").dispatchEvent(new Event("blur"))');
    await sleep(1500);
  }

  // Varios movimientos repartidos por la semana: con uno solo el resumen es
  // tan pobre que el modelo no tiene de dónde sacar hallazgos reales.
  const MOVIMIENTOS = [
    { importe: '48,60', dia: 0, concepto: 'Mercadona', categoria: 0 },
    { importe: '72,15', dia: 2, concepto: 'Compra semanal', categoria: 0 },
    { importe: '13,99', dia: 3, concepto: 'Netflix Estándar', categoria: 3 },
    { importe: '54,20', dia: 4, concepto: 'Gasolinera', categoria: 2 },
    { importe: '26,80', dia: 5, concepto: 'Cena con amigos', categoria: 3 },
  ];

  const sumarDias = (iso, n) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  for (const m of MOVIMIENTOS) {
    await evaluate(`document.querySelector('ft-sidebar a[href="/events"]').click()`);
    await sleep(2000);
    await evaluate(`document.querySelector('a[href="/events/new"]').click()`);
    await sleep(2200);
    await escribir('ft-input-importe input', m.importe);
    await escribir('#fecha', sumarDias(lunesPasado, m.dia));
    await escribir('#concepto', m.concepto);
    await evaluate(`document.querySelectorAll("ft-chip-categoria button")[${m.categoria}].click()`);
    await sleep(300);
    await evaluate(
      '(() => { const b = [...document.querySelectorAll("ft-barra-acciones button")].find(x => x.textContent.trim() === "Guardar"); if (!b) return false; b.click(); return true; })()',
    );
    await sleep(2500);
  }

  // Navegación del router, no recarga: en modo demo la base de datos vive en
  // memoria y un `Page.navigate` perdería el movimiento recién guardado.
  await evaluate(`document.querySelector('ft-sidebar a[href="/ai"]').click()`);
  await sleep(4000);

  // Pulsar «Generar análisis» (estado vacío) o «Regenerar análisis» (cabecera).
  const pulsado = await evaluate(
    '(() => { const b = [...document.querySelectorAll("button")].find(x => /Generar an|Regenerar an/.test(x.textContent)); if (!b) return false; b.click(); return true; })()',
  );
  if (!pulsado) throw new Error('no se encontro el boton de generar');

  // Estado «generando»: spinner, contador y barra de progreso.
  await sleep(900);
  const generando = await evaluate('document.querySelector(".generando__titulo")?.textContent?.trim() ?? ""');
  const meta = await evaluate('document.querySelector(".generando__meta")?.textContent?.trim() ?? ""');
  await shot(out.replace('.png', '-generando.png'));

  // Esperar el informe.
  // Un modelo local real escribe a pocos tokens por segundo: el informe puede
  // pasar del minuto. Con el servidor falso termina en el primer ciclo.
  let veredicto = '';
  for (let i = 0; i < 600; i++) {
    await sleep(500);
    veredicto = await evaluate('document.querySelector(".veredicto")?.textContent?.trim() ?? ""');
    if (veredicto) break;
  }
  await sleep(500);
  await shot(out);

  const hallazgos = await evaluate('document.querySelectorAll(".hallazgo").length');
  const recomendaciones = await evaluate('document.querySelectorAll(".recomendacion").length');
  const ahorro = await evaluate('document.querySelector("ft-potencial-ahorro .display")?.textContent?.trim() ?? ""');
  const errorCard = await evaluate('document.querySelector(".titulo-error")?.textContent?.trim() ?? ""');

  console.log(
    [
      'generando: ' + (generando || '(no visto)'),
      'meta: ' + (meta || '(no vista)'),
      'veredicto: ' + (veredicto || '(ninguno)'),
      'hallazgos: ' + hallazgos + ' · recomendaciones: ' + recomendaciones,
      'potencial de ahorro: ' + ahorro,
      errorCard ? 'error en tarjeta: ' + errorCard : '',
      logs.length ? 'consola: ' + logs.join(' | ') : '',
    ]
      .filter(Boolean)
      .join(NL),
  );
} finally {
  proc.kill();
}
