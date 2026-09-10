// Prueba de extremo a extremo de Ajustes sobre el build demo: crear y editar
// categorías, alta de ingreso recurrente, presupuesto y formato de fecha.
// Uso: node tools/settings-e2e.mjs [salidaPng] [ancho] [alto] [urlBase]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'settings-e2e.png';
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
  await send('Page.navigate', { url: base + '/settings' }, sessionId);
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

  comprobar('la pantalla carga sin el error de arranque', !(await evaluar('!!document.querySelector("ft-tarjeta-error")')));

  const categoriasIniciales = await evaluar('document.querySelectorAll("ft-lista-categorias .fila").length');
  comprobar('lista las categorías de la semilla', categoriasIniciales >= 6, String(categoriasIniciales));

  // 1 · Alta de categoría.
  await pulsarTexto('ft-lista-categorias button.ft-link', '+ Añadir categoría');
  await sleep(600);
  comprobar('el modal de categoría se abre', await evaluar('!!document.querySelector("ft-modal-categoria dialog[open]")'));
  await escribir('ft-modal-categoria input.ft-input', 'Mascotas');
  await evaluar('document.querySelectorAll("ft-modal-categoria .muestra")[4].click()');
  await pulsarTexto('ft-modal-categoria button', 'Guardar');
  await sleep(1200);

  const conNueva = await evaluar(
    '[...document.querySelectorAll("ft-lista-categorias .nombre")].map(n => n.textContent.trim())',
  );
  comprobar('la categoría nueva aparece en la lista', conNueva.includes('Mascotas'), JSON.stringify(conNueva));
  comprobar('sin movimientos asociados', await evaluar(
    '[...document.querySelectorAll("ft-lista-categorias .fila")].some(f => f.textContent.includes("Mascotas") && f.textContent.includes("0 movimientos"))',
  ));

  // 2 · Editarla y borrarla.
  await evaluar(
    '[...document.querySelectorAll("ft-lista-categorias .fila")].find(f => f.textContent.includes("Mascotas")).click()',
  );
  await sleep(600);
  await escribir('ft-modal-categoria input.ft-input', 'Mascotas y veterinario');
  await pulsarTexto('ft-modal-categoria button', 'Guardar');
  await sleep(1200);
  comprobar(
    'el cambio de nombre se guarda',
    await evaluar('!!document.body.textContent.includes("Mascotas y veterinario")'),
  );

  // 3 · Presupuestos: alta de un límite de gasto total desde el modal.
  await pulsarTexto('ft-presupuestos button.ft-link', '+ Añadir presupuesto');
  await sleep(600);
  comprobar('el modal de presupuesto se abre', await evaluar('!!document.querySelector("ft-modal-presupuesto dialog[open]")'));
  await escribir('ft-modal-presupuesto input.ft-input', '1.900,00');
  await pulsarTexto('ft-modal-presupuesto button', 'Guardar');
  await sleep(1200);
  const filasPresupuesto = await evaluar(
    '[...document.querySelectorAll("ft-presupuestos .fila")].map(f => f.textContent)',
  );
  comprobar(
    'el presupuesto aparece en la lista',
    Array.isArray(filasPresupuesto) && filasPresupuesto.some((t) => t.includes('Gasto total') && t.includes('1.900,00')),
    JSON.stringify(filasPresupuesto),
  );

  // 4 · Formato de fecha: el cambio tiene que llegar a Analítica.
  await pulsarTexto('ft-moneda-formato button[role="radio"]', 'AAAA-MM-DD');
  await sleep(1000);
  // Navegación del router, no recarga: en modo demo la base de datos vive en
  // memoria y un `Page.navigate` perdería lo que se acaba de guardar.
  await evaluar(`document.querySelector('ft-sidebar a[href="/analytics"]').click()`);
  await sleep(3000);
  const rango = await evaluar('document.querySelector("ft-selector-rango")?.textContent?.trim() ?? ""');
  comprobar('el selector de rango usa AAAA-MM-DD', /\d{4}-\d{2}-\d{2}/.test(rango), rango);

  await evaluar(`document.querySelector('ft-sidebar a[href="/settings"]').click()`);
  await sleep(2500);
  await pulsarTexto('ft-moneda-formato button[role="radio"]', 'DD/MM/AAAA');
  await sleep(900);

  // 5 · Alta de ingreso recurrente.
  const ingresosAntes = await evaluar('document.querySelectorAll("ft-ingresos-recurrentes .fila").length');
  await pulsarTexto('ft-ingresos-recurrentes button.ft-link', '+ Añadir ingreso recurrente');
  await sleep(600);
  comprobar(
    'el modal de ingreso se abre',
    await evaluar('!!document.querySelector("ft-modal-ingreso-recurrente dialog[open]")'),
  );
  await escribir('ft-modal-ingreso-recurrente input.ft-input', 'Alquiler de la plaza de garaje');
  await escribir('ft-modal-ingreso-recurrente input.num', '85,00');
  await pulsarTexto('ft-modal-ingreso-recurrente button', 'Guardar');
  await sleep(1200);
  const ingresosDespues = await evaluar('document.querySelectorAll("ft-ingresos-recurrentes .fila").length');
  comprobar('el ingreso recurrente se guarda', ingresosDespues === ingresosAntes + 1, `${ingresosAntes} → ${ingresosDespues}`);
  comprobar(
    'con su importe en verde',
    await evaluar(
      '[...document.querySelectorAll("ft-ingresos-recurrentes .fila")].some(f => f.textContent.includes("85,00") && !!f.querySelector(".ft-c-income"))',
    ),
  );

  // 6 · Un importe no válido no se guarda.
  await pulsarTexto('ft-presupuestos button.ft-link', '+ Añadir presupuesto');
  await sleep(600);
  await escribir('ft-modal-presupuesto input.ft-input', 'no soy un importe');
  await pulsarTexto('ft-modal-presupuesto button', 'Guardar');
  await sleep(600);
  comprobar(
    'un presupuesto no válido muestra el error',
    await evaluar('!!document.querySelector("ft-modal-presupuesto .ft-field__error")'),
  );

  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(out, Buffer.from(shot.data, 'base64'));

  console.log(
    fallos.length === 0 ? '\nTodo correcto · captura → ' + out : '\n' + fallos.length + ' fallo(s): ' + fallos.join(', '),
  );
  if (fallos.length > 0) process.exitCode = 1;
} finally {
  proc.kill();
}
