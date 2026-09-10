// Prueba de extremo a extremo de la calculadora sobre el build real:
// Ctrl+K desde el dashboard, la operación del handoff (1.884,37 ÷ 30),
// reutilizar el historial y «Usar 62,81 en nuevo evento».
// Uso: node tools/calc-e2e.mjs [salidaPng] [ancho] [alto] [urlBase]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'calc-e2e.png';
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 900);
const base = process.argv[5] ?? 'http://localhost:4300';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9600 + Math.floor(Math.random() * 150);

const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  `--window-size=${Math.max(width, 800)},${Math.max(height, 600)}`,
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

const fallos = [];
const comprobar = (nombre, condicion, detalle = '') => {
  if (condicion) {
    console.log('  ok    ' + nombre);
  } else {
    console.log('  FALLO ' + nombre + (detalle ? ' — ' + detalle : ''));
    fallos.push(nombre);
  }
};

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
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: width <= 640 },
    sessionId,
  );
  await send('Page.navigate', { url: base + '/dashboard' }, sessionId);
  await sleep(4500);

  const evaluar = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result?.value;
  };

  // 1 · Ctrl+K abre el panel sin desmontar el dashboard.
  const teclaK = { key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...teclaK }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...teclaK }, sessionId);
  await sleep(1500);
  comprobar('Ctrl+K abre la calculadora', await evaluar('!!document.querySelector("ft-panel-lateral")'));
  comprobar('el dashboard sigue montado detrás', await evaluar('!!document.querySelector("ft-dashboard")'));

  // 2 · La operación del handoff, pulsando las teclas de la interfaz.
  const pulsar = async (aria) => {
    const sel = 'ft-teclado-calc button[aria-label=' + JSON.stringify(aria) + ']';
    const ok = await evaluar(
      '(() => { const b = document.querySelector(' + JSON.stringify(sel) + '); if (!b) return false; b.click(); return true; })()',
    );
    if (!ok) throw new Error('no existe la tecla ' + aria);
  };
  const secuencia = ['Uno', 'Ocho', 'Ocho', 'Cuatro', 'Coma decimal', 'Tres', 'Siete', 'Dividir', 'Tres', 'Cero', 'Igual'];
  for (const aria of secuencia) await pulsar(aria);
  await sleep(400);

  const expresion = await evaluar('document.querySelector("ft-display-calc .operacion")?.textContent?.trim()');
  const resultado = await evaluar('document.querySelector("ft-display-calc .resultado")?.textContent?.trim()');
  comprobar('la línea de operación es la del handoff', expresion === '1.884,37 ÷ 30 =', expresion);
  comprobar('el resultado es 62,81', resultado === '62,81', resultado);

  const historial = await evaluar(
    '[...document.querySelectorAll("ft-historial-calc .fila")].map(f => f.textContent.replace(/\\s+/g, " ").trim())',
  );
  comprobar(
    'la operación entra en el historial',
    Array.isArray(historial) && historial[0] === '1.884,37 ÷ 3062,81',
    JSON.stringify(historial),
  );

  const etiqueta = await evaluar('document.querySelector("ft-panel-lateral .pie button")?.textContent?.trim()');
  comprobar('la barra inferior ofrece el resultado', etiqueta === 'Usar 62,81 en nuevo evento', etiqueta);

  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(out, Buffer.from(shot.data, 'base64'));

  // 3 · Reutilizar una fila del historial devuelve su resultado al display.
  await evaluar('document.querySelector("ft-historial-calc .fila").click()');
  await sleep(400);
  comprobar(
    'reutilizar el historial carga el resultado',
    (await evaluar('document.querySelector("ft-display-calc .resultado")?.textContent?.trim()')) === '62,81',
  );

  // 4 · «Usar 62,81 en nuevo evento» navega con el importe precargado.
  await evaluar('document.querySelector("ft-panel-lateral .pie button").click()');
  await sleep(3000);
  const url = await evaluar('location.pathname + location.search');
  comprobar('navega a /events/new con los céntimos', url === '/events/new?amount=6281', url);
  comprobar('el panel se ha cerrado', !(await evaluar('!!document.querySelector("ft-panel-lateral")')));
  const importe = await evaluar('document.querySelector("ft-input-importe input")?.value');
  comprobar('el formulario abre con 62,81', importe === '62,81', importe);

  // 5 · Ctrl+K y Escape desde otra ruta.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...teclaK }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...teclaK }, sessionId);
  await sleep(1200);
  comprobar('Ctrl+K también funciona en /events/new', await evaluar('!!document.querySelector("ft-panel-lateral")'));
  const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...escape }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...escape }, sessionId);
  await sleep(900);
  comprobar('Escape cierra el panel', !(await evaluar('!!document.querySelector("ft-panel-lateral")')));

  console.log(
    fallos.length === 0 ? '\nTodo correcto · captura → ' + out : '\n' + fallos.length + ' fallo(s): ' + fallos.join(', '),
  );
  if (fallos.length > 0) process.exitCode = 1;
} finally {
  proc.kill();
}
