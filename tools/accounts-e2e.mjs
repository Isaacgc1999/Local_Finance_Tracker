// Prueba de extremo a extremo de Cuentas sobre el build demo: «Cuenta principal»
// de serie, alta de dos cuentas, traspaso entre ellas, un gasto cargado a una cuenta y conciliación
// con ajuste. Comprueba que el traspaso no cambia el total.
// Uso: node tools/accounts-e2e.mjs [salidaPng] [ancho] [alto] [urlBase]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'accounts-e2e.png';
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 1150);
const base = process.argv[5] ?? 'http://localhost:4300';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9450 + Math.floor(Math.random() * 140);

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
  await send('Page.navigate', { url: base + '/accounts' }, sessionId);
  await sleep(5000);

  const evaluar = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result?.value;
  };

  // Escribe en un input y dispara el evento que escucha Angular.
  const escribir = async (selector, valor, tipo = 'input') => {
    const js =
      '(() => { const el = document.querySelector(' +
      JSON.stringify(selector) +
      '); if (!el) return false; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;' +
      ' Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, ' +
      JSON.stringify(valor) +
      '); el.dispatchEvent(new Event(' +
      JSON.stringify(tipo) +
      ', { bubbles: true })); return true; })()';
    const ok = await evaluar(js);
    if (!ok) throw new Error('no existe el campo ' + selector);
  };

  const pulsarTexto = async (selector, texto) => {
    const js =
      '(() => { const b = [...document.querySelectorAll(' +
      JSON.stringify(selector) +
      ')].find(x => x.textContent.trim() === ' +
      JSON.stringify(texto) +
      '); if (!b) return false; b.click(); return true; })()';
    const ok = await evaluar(js);
    if (!ok) throw new Error('no existe el botón «' + texto + '»');
  };

  const elegir = async (selector, opcion, indice = 0) => {
    const js =
      '(() => { const s = document.querySelectorAll(' +
      JSON.stringify(selector) +
      ')[' +
      indice +
      ']; const o = s && [...s.options].find(x => x.textContent.trim() === ' +
      JSON.stringify(opcion) +
      '); if (!o) return false; s.value = o.value; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()';
    const ok = await evaluar(js);
    if (!ok) throw new Error('no existe la opción «' + opcion + '» en ' + selector);
  };

  const texto = (selector) => evaluar(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ''`);
  const saldoDe = (nombre) =>
    evaluar(
      `[...document.querySelectorAll('ft-accounts .cuenta')].find(c => c.querySelector('.cuenta__nombre')?.textContent.trim() === ${JSON.stringify(nombre)})?.querySelector('.cuenta__saldo')?.textContent.trim() ?? ''`,
    );
  // Navegación del router, no recarga: en modo demo la base de datos vive en memoria.
  const irA = async (href) => {
    await evaluar(`document.querySelector('a[href="${href}"]').click()`);
    await sleep(2200);
  };

  comprobar('la pantalla carga sin el error de arranque', !(await evaluar('!!document.querySelector("ft-tarjeta-error")')));
  comprobar('no hay estado vacío', !(await evaluar('!!document.querySelector("ft-accounts ft-estado-vacio")')));
  comprobar('«Cuenta principal» existe de serie con 0,00', (await saldoDe('Cuenta principal')).startsWith('0,00'), await saldoDe('Cuenta principal'));

  // 1 · Dos cuentas más.
  const altaCuenta = async (nombre, saldo, tipo) => {
    await pulsarTexto('ft-accounts button', '+ Nueva cuenta');
    await sleep(600);
    await escribir('ft-modal-cuenta input.ft-input:not(.num)', nombre);
    if (tipo) await pulsarTexto('ft-modal-cuenta ft-segmented-control button', tipo);
    await escribir('ft-modal-cuenta input[inputmode="decimal"]', saldo);
    await pulsarTexto('ft-modal-cuenta button', 'Guardar');
    await sleep(1200);
  };
  await altaCuenta('BBVA nómina', '1.500,00');
  await altaCuenta('Efectivo', '40', 'Efectivo');
  comprobar('aparecen las tres cuentas', (await evaluar('document.querySelectorAll("ft-accounts .cuenta").length')) === 3);
  comprobar('saldo de apertura de BBVA', (await saldoDe('BBVA nómina')).startsWith('1.500,00'), await saldoDe('BBVA nómina'));
  const totalInicial = await texto('.total__cifra');
  comprobar('total 1.540,00', totalInicial.startsWith('1.540,00'), totalInicial);

  // 2 · Un nombre repetido no se guarda.
  await pulsarTexto('ft-accounts button', '+ Nueva cuenta');
  await sleep(600);
  await escribir('ft-modal-cuenta input.ft-input:not(.num)', 'efectivo');
  await pulsarTexto('ft-modal-cuenta button', 'Guardar');
  await sleep(900);
  comprobar('nombre repetido muestra el error', (await texto('ft-modal-cuenta .ft-field__error')).includes('Ya hay una cuenta'));
  await pulsarTexto('ft-modal-cuenta button', 'Cancelar');
  await sleep(400);

  // 3 · Traspaso de 60 € de BBVA a Efectivo.
  await pulsarTexto('ft-accounts button', 'Nuevo traspaso');
  await sleep(600);
  comprobar(
    'el traspaso propone salir de «Cuenta principal»',
    (await evaluar('document.querySelector("ft-modal-traspaso select")?.selectedOptions[0]?.textContent.trim()')) === 'Cuenta principal',
  );
  await elegir('ft-modal-traspaso select', 'BBVA nómina');
  await sleep(200);
  await elegir('ft-modal-traspaso select', 'Efectivo', 1);
  await escribir('ft-modal-traspaso input[inputmode="decimal"]', '60');
  await escribir('ft-modal-traspaso input[maxlength="80"]', 'Cajero');
  await pulsarTexto('ft-modal-traspaso button', 'Guardar');
  await sleep(1200);
  comprobar('BBVA baja a 1.440,00', (await saldoDe('BBVA nómina')).startsWith('1.440,00'), await saldoDe('BBVA nómina'));
  comprobar('Efectivo sube a 100,00', (await saldoDe('Efectivo')).startsWith('100,00'), await saldoDe('Efectivo'));
  comprobar('el total no cambia', (await texto('.total__cifra')) === totalInicial, await texto('.total__cifra'));
  comprobar('aparece en traspasos recientes', (await texto('ft-accounts .lista-card .fila')).includes('BBVA nómina → Efectivo'));

  // 4 · Un gasto cargado a BBVA desde el formulario de evento.
  await irA('/events');
  await irA('/events/new');
  const cuentaPorDefecto = await evaluar('document.querySelector("#cuenta-id")?.selectedOptions[0]?.textContent.trim()');
  comprobar('el formulario propone «Cuenta principal»', cuentaPorDefecto === 'Cuenta principal', cuentaPorDefecto);
  await elegir('#cuenta-id', 'BBVA nómina');
  await escribir('ft-input-importe input', '40,00');
  await escribir('#concepto', 'Mercadona');
  await evaluar('document.querySelectorAll("ft-chip-categoria button")[0].click()');
  await sleep(300);
  await pulsarTexto('ft-barra-acciones button', 'Guardar');
  await sleep(2500);
  await irA('/accounts');
  comprobar('el gasto resta de BBVA', (await saldoDe('BBVA nómina')).startsWith('1.400,00'), await saldoDe('BBVA nómina'));

  // 5 · Conciliación: el banco dice 1.395,50 → ajuste de −4,50.
  await evaluar(
    `[...document.querySelectorAll('ft-accounts .cuenta')].find(c => c.textContent.includes('BBVA nómina')).querySelector('button').click()`,
  );
  await sleep(2200);
  comprobar('abre la conciliación', (await texto('ft-conciliacion h1')) === 'Conciliar BBVA nómina', await texto('ft-conciliacion h1'));
  const lineas = await evaluar('[...document.querySelectorAll("ft-conciliacion .extracto .fila")].map(f => f.textContent.replace(/\\s+/g, " ").trim())');
  comprobar(
    'el extracto lista el traspaso y el gasto con saldo corrido',
    lineas.some((l) => l.includes('Cajero') && l.includes('1.440,00')) && lineas.some((l) => l.includes('Mercadona') && l.includes('1.400,00')),
    JSON.stringify(lineas),
  );
  await escribir('ft-conciliacion input[inputmode="decimal"]', '1.395,50');
  await sleep(300);
  const diferencia = await texto('ft-conciliacion .resumen__fila.fuerte dd');
  comprobar('calcula la diferencia', diferencia.startsWith('−4,50'), diferencia);
  const shotConciliacion = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(out.replace(/\.png$/, '-conciliacion.png'), Buffer.from(shotConciliacion.data, 'base64'));
  await pulsarTexto('ft-conciliacion button', 'Conciliar');
  await sleep(1500);
  comprobar('queda en el historial', (await texto('ft-conciliacion .bloque:nth-of-type(2) .fila')).includes('ajuste −4,50'), await texto('ft-conciliacion .bloque:nth-of-type(2) .fila'));
  await irA('/accounts');
  comprobar('BBVA cuadra con el banco', (await saldoDe('BBVA nómina')).startsWith('1.395,50'), await saldoDe('BBVA nómina'));
  comprobar('la tarjeta dice que está conciliada', await evaluar('document.body.textContent.includes("conciliada el")'));

  // 6 · Analítica no ve el traspaso: solo el gasto de 40 €.
  await irA('/events');
  const filas = await evaluar('document.querySelectorAll("ft-fila-movimiento").length');
  comprobar('Movimientos no lista el traspaso ni el ajuste', filas === 1, String(filas));
  await irA('/accounts');

  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(out, Buffer.from(shot.data, 'base64'));

  console.log(
    fallos.length === 0 ? '\nTodo correcto · captura → ' + out : '\n' + fallos.length + ' fallo(s): ' + fallos.join(', '),
  );
  if (fallos.length > 0) process.exitCode = 1;
} finally {
  proc.kill();
}
