// Captura de pantalla con viewport real vía Chrome DevTools Protocol.
// Uso: node tools/screenshot.mjs <url> <salida.png> [ancho] [alto] [esperaMs] [clickSelector]
// Chrome headless en Windows no permite ventanas de menos de ~500px, así que
// el ancho se impone con Emulation.setDeviceMetricsOverride.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, out, w = '1440', h = '900', wait = '4000', clickSelector = ''] = process.argv.slice(2);
if (!url || !out) {
  console.error('uso: node tools/screenshot.mjs <url> <salida.png> [ancho] [alto] [esperaMs] [clickSelector]');
  process.exit(1);
}
const width = Number(w);
const height = Number(h);
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  `--window-size=${Math.max(width, 800)},${Math.max(height, 600)}`,
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function version() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return res.json();
    } catch {
      /* aún arrancando */
    }
    await sleep(200);
  }
  throw new Error('Chrome no responde');
}

let id = 0;
const pending = new Map();
const events = [];
let ws;

function send(method, params = {}, sessionId) {
  const msgId = ++id;
  return new Promise((resolve, reject) => {
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });
}

try {
  const { webSocketDebuggerUrl } = await version();
  ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: width <= 640 },
    sessionId,
  );
  await send('Page.navigate', { url }, sessionId);
  await sleep(Number(wait));
  // Varios clics encadenados con `;;` (p. ej. abrir la calculadora y luego
  // cambiar de pestaña). Cada uno espera 800 ms antes del siguiente.
  for (const selector of clickSelector ? clickSelector.split(';;') : []) {
    await send(
      'Runtime.evaluate',
      { expression: `document.querySelector(${JSON.stringify(selector.trim())})?.click()`, awaitPromise: true },
      sessionId,
    );
    await sleep(800);
  }
  const errors = events
    .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
    .map((e) => JSON.stringify(e.params).slice(0, 300));
  const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`captura ${width}×${height} → ${out}${errors.length ? `\nerrores de consola:\n${errors.join('\n')}` : ''}`);
} finally {
  proc.kill();
}
