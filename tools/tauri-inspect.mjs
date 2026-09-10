// Inspecciona el ejecutable REAL de Tauri (no el navegador): se conecta por
// CDP a su WebView2 y recoge los errores de consola (entre ellos las
// violaciones de CSP), el estado de las hojas de estilo y capturas.
//
// Tauri pasa sus propios argumentos a WebView2, así que la variable
// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS se ignora. El puerto de depuración se
// abre compilando con la configuración de inspección, que nunca se distribuye:
//   npx tauri build --no-bundle --config src-tauri/tauri.inspect.conf.json
//
// Uso: node tools/tauri-inspect.mjs [exe] [carpetaCapturas] [ruta1,ruta2,...] [puerto]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const exe = process.argv[2] ?? 'src-tauri/target/release/fintrack.exe';
const outDir = process.argv[3] ?? '.tmp-tauri';
// Git Bash convierte «/dashboard» en «C:/Program Files/Git/dashboard»: se
// aceptan rutas con o sin barra y se normalizan aquí.
const rutas = (process.argv[4] ?? 'dashboard')
  .split(',')
  .filter(Boolean)
  .map((r) => '/' + r.replace(/^.*\/Git\//, '').replace(/^\/+/, ''));
const port = Number(process.argv[5] ?? 9433);
mkdirSync(outDir, { recursive: true });

const proc = spawn(exe, [], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let id = 0;
const pending = new Map();
const eventos = [];
let ws;
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

try {
  let page;
  for (let i = 0; i < 80 && !page; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      // WebView2 crea primero una pestaña about:blank; la de la app es la
      // que sirve el protocolo de Tauri.
      page = targets.find((t) => t.type === 'page' && /tauri\.localhost|^tauri:/.test(t.url));
    } catch {
      /* WebView2 arrancando */
    }
  }
  if (!page) throw new Error('No se pudo conectar con WebView2 (¿arrancó la ventana?)');

  ws = new WebSocket(page.webSocketDebuggerUrl);
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
    } else if (msg.method) {
      eventos.push(msg);
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  // Recarga para capturar también los errores del arranque.
  await send('Page.reload', { ignoreCache: true });
  await sleep(5000);

  const evaluar = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result?.value;
  };

  const diagnostico = await evaluar(`(() => {
    const hojas = [...document.styleSheets].map((s) => ({
      href: s.href ? s.href.split('/').pop() : '(en línea)',
      media: s.media?.mediaText || 'all',
      reglas: (() => { try { return s.cssRules.length; } catch { return 'sin acceso'; } })(),
    }));
    const shell = document.querySelector('ft-shell');
    return {
      url: location.href,
      idioma: navigator.language,
      ancho: innerWidth,
      hojas,
      estilosEnLinea: document.querySelectorAll('style').length,
      shellDisplay: shell ? getComputedStyle(shell).display : '(sin shell)',
      botonFondo: (() => { const b = document.querySelector('.ft-btn'); return b ? getComputedStyle(b).backgroundColor : '(sin .ft-btn)'; })(),
      sidebar: !!document.querySelector('ft-sidebar'),
      tabBar: !!document.querySelector('ft-tab-bar'),
    };
  })()`);
  console.log('DIAGNÓSTICO ' + JSON.stringify(diagnostico, null, 2));

  // Hover real sobre el botón primario («+ Nuevo evento»): el ratón se mueve
  // a su centro y se lee el color calculado del texto frente al del fondo.
  const rect = await evaluar(
    `(() => { const a = document.querySelector('a.ft-btn--primary'); if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, texto: a.textContent.trim() }; })()`,
  );
  if (rect) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await sleep(400);
    const hover = await evaluar(
      `(() => { const a = document.querySelector('a.ft-btn--primary'); const s = getComputedStyle(a); return { hover: a.matches(':hover'), color: s.color, fondo: s.backgroundColor }; })()`,
    );
    console.log('HOVER «' + rect.texto + '» ' + JSON.stringify(hover));
    const { data: shotHover } = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: Math.max(0, rect.x - 130), y: Math.max(0, rect.y - 32), width: 260, height: 64, scale: 1 },
    });
    writeFileSync(join(outDir, 'tauri-hover.png'), Buffer.from(shotHover, 'base64'));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
  }

  for (const ruta of rutas) {
    await evaluar(`(() => { const a = document.querySelector('a[href="${ruta}"]'); if (a) a.click(); })()`);
    await sleep(2500);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const nombre = join(outDir, 'tauri' + ruta.replace(/\//g, '-') + '.png');
    writeFileSync(nombre, Buffer.from(data, 'base64'));
    console.log('captura ' + ruta + ' -> ' + nombre);
  }

  // Ollama visto desde la app real: las peticiones salen por plugin-http
  // (Rust), no por el fetch del navegador, así que solo aquí se ve si Ollama
  // acepta la cabecera Origin de la webview.
  await evaluar(`(() => { const a = document.querySelector('a[href="/settings"]'); if (a) a.click(); })()`);
  await sleep(2000);
  await evaluar(
    '(() => { const b = [...document.querySelectorAll("ft-ajustes-ollama button")].find(x => x.textContent.trim() === "Probar conexión"); if (b) b.click(); })()',
  );
  await sleep(4000);
  const ollama = await evaluar(`(() => ({
    pill: document.querySelector('ft-ajustes-ollama ft-pill-estado')?.textContent?.trim() ?? '(sin pill)',
    mensaje: document.querySelector('ft-ajustes-ollama .mensaje')?.textContent?.trim() ?? '',
    modelos: [...document.querySelectorAll('ft-ajustes-ollama select option')].map((o) => o.textContent.trim()),
  }))()`);
  console.log('OLLAMA ' + JSON.stringify(ollama));
  const { data: shotOllama } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, 'tauri-ollama.png'), Buffer.from(shotOllama, 'base64'));

  const errores = eventos
    .filter(
      (e) =>
        (e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level)) ||
        (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') ||
        e.method === 'Runtime.exceptionThrown',
    )
    .map((e) =>
      e.method === 'Log.entryAdded'
        ? e.params.entry.text
        : e.method === 'Runtime.exceptionThrown'
          ? 'EXCEPCIÓN ' + (e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text)
          : e.params.args.map((a) => a.value ?? a.description).join(' '),
    );
  const unicos = [...new Set(errores.map((t) => t.slice(0, 260)))];
  console.log(`ERRORES (${errores.length}, ${unicos.length} distintos)`);
  for (const t of unicos.slice(0, 15)) console.log(' - ' + t);
} finally {
  proc.kill();
}
