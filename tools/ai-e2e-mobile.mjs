// Igual que ai-e2e.mjs pero con viewport móvil: genera el informe y captura.
// Uso: node tools/ai-e2e-mobile.mjs <salidaPng> [ancho] [alto] [urlBase]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'ai-mobile.png';
const width = Number(process.argv[3] ?? 390);
const height = Number(process.argv[4] ?? 1100);
const base = process.argv[5] ?? 'http://localhost:4300';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9800 + Math.floor(Math.random() * 150);

const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  '--window-size=900,1200',
  'about:blank',
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  let info;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        info = await res.json();
        break;
      }
    } catch {
      /* arrancando */
    }
    await sleep(200);
  }
  if (!info) throw new Error('Chrome no responde');

  ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 640 }, sessionId);
  await send('Page.navigate', { url: base + '/ai' }, sessionId);
  await sleep(6000);

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    return res.result?.value;
  };

  const pulsado = await evaluate(
    '(() => { const b = [...document.querySelectorAll("button")].find(x => /Generar an|Regenerar an/.test(x.textContent)); if (!b) return false; b.click(); return true; })()',
  );
  if (!pulsado) throw new Error('no se encontro el boton de generar');

  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if (await evaluate('!!document.querySelector(".veredicto")')) break;
  }
  await sleep(600);
  const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('captura ' + width + 'x' + height + ' -> ' + out);
} finally {
  proc.kill();
}
