// Prueba de extremo a extremo de la exportación en un navegador real:
// abre /analytics en el modo demo, pulsa Exportar → formato → Exportar y
// comprueba que la descarga produce un fichero válido.
// Uso: node tools/export-e2e.mjs [xlsx|pdf|docx] [urlBase] [carpetaDescargas]
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const format = process.argv[2] ?? 'xlsx';
const base = process.argv[3] ?? 'http://localhost:4200';
const downloads = process.argv[4] ?? join(process.cwd(), '.tmp-downloads', format);
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9500 + Math.floor(Math.random() * 400);
const LABEL = { xlsx: 'Excel', pdf: 'PDF', docx: 'Word' };
const NL = String.fromCharCode(10);

rmSync(downloads, { recursive: true, force: true });
mkdirSync(downloads, { recursive: true });

const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  '--window-size=1440,1000',
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

const listFiles = () => readdirSync(downloads).filter((f) => !f.endsWith('.crdownload'));

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
      logs.push('EXCEPCION ' + JSON.stringify(msg.params).slice(0, 400));
    } else if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      logs.push(msg.params.type + ' ' + JSON.stringify(msg.params.args).slice(0, 400));
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  await send('Page.navigate', { url: base + '/events/new' }, sessionId);
  await sleep(6000);

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (res.exceptionDetails) throw new Error(expression + ': ' + JSON.stringify(res.exceptionDetails).slice(0, 300));
    return res.result?.value;
  };

  const clickByText = (selector, text) =>
    evaluate(
      '(() => { const b = [...document.querySelectorAll(' +
        JSON.stringify(selector) +
        ')].find(x => x.textContent.trim().startsWith(' +
        JSON.stringify(text) +
        ')); if (!b) return false; b.click(); return true; })()',
    );

  const readToasts = () =>
    evaluate('[...document.querySelectorAll("ft-pill-estado")].map(e => e.textContent.trim()).join(" | ")');

  // 0) Sin datos de ejemplo la analítica arranca vacía: se registran dos
  //    movimientos desde el formulario real y se va a Analítica por el router
  //    (en modo demo la base vive en memoria y una recarga la vaciaría).
  const escribir = async (selector, valor) => {
    const js =
      '(() => { const el = document.querySelector(' +
      JSON.stringify(selector) +
      '); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ' +
      JSON.stringify(valor) +
      '); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()';
    if (!(await evaluate(js))) throw new Error('no existe el campo ' + selector);
  };
  const hoy = new Date().toISOString().slice(0, 10);
  for (const [importe, concepto] of [['48,60', 'Mercadona'], ['54,20', 'Gasolinera']]) {
    if (!(await evaluate('location.pathname === "/events/new"'))) {
      await evaluate(`document.querySelector('ft-sidebar a[href="/events"]').click()`);
      await sleep(2000);
      await evaluate(`document.querySelector('a[href="/events/new"]').click()`);
      await sleep(2200);
    }
    await escribir('ft-input-importe input', importe);
    await escribir('#fecha', hoy);
    await escribir('#concepto', concepto);
    await evaluate('document.querySelector("ft-chip-categoria button").click()');
    await sleep(300);
    await evaluate(
      '(() => { const b = [...document.querySelectorAll("ft-barra-acciones button")].find(x => x.textContent.trim() === "Guardar"); if (b) b.click(); })()',
    );
    await sleep(2500);
  }
  await evaluate(`document.querySelector('ft-sidebar a[href="/analytics"]').click()`);
  await sleep(3500);
  console.log('tarjeta de presupuestos en Analítica: ' + (await evaluate('!!document.querySelector("ft-progreso-presupuestos")')));

  // 1) Abrir el menú Exportar y elegir el formato.
  await evaluate('document.querySelector("ft-menu-desplegable button.disparador").click()');
  await sleep(400);
  if (!(await clickByText('[role="menuitem"]', LABEL[format]))) throw new Error('no se encontro la opcion ' + LABEL[format]);
  await sleep(500);

  // 2) Comprobar el modal y activar «incluir movimientos en bruto».
  const titulo = await evaluate('document.querySelector("ft-modal .titulo")?.textContent?.trim()');
  if (titulo !== 'Exportar a ' + LABEL[format]) throw new Error('titulo inesperado del modal: ' + titulo);
  await evaluate('[...document.querySelectorAll("ft-modal ft-toggle button")][2]?.click()');
  await sleep(200);

  // 3) Exportar y esperar la descarga (el chunk de jsPDF pesa 400 kB).
  if (!(await clickByText('ft-modal button', 'Exportar'))) throw new Error('no se encontro el boton Exportar del modal');
  let toast = '';
  let files = [];
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    files = listFiles();
    if (files.length > 0) break;
    if (!toast) toast = await readToasts();
  }

  if (toast) console.log('aviso en pantalla:', toast);
  if (logs.length) console.log(['consola:', ...logs].join(NL));
  if (files.length === 0) throw new Error('no se descargo ningun fichero');

  const size = statSync(join(downloads, files[0])).size;
  if (size < 1000) throw new Error('fichero sospechosamente pequeno: ' + size + ' bytes');
  console.log('OK ' + format + ': ' + files[0] + ' (' + size + ' bytes)');
} finally {
  proc.kill();
}
