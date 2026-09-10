// Prueba de extremo a extremo de los gráficos de Analítica con scroll
// horizontal (ADR-079), en un navegador real contra `ng serve`:
// registra movimientos repartidos en varios años, recorre Día / Semana / Mes /
// Año con rangos grandes y comprueba, en los dos gráficos, que se ven a la vez
// los periodos de VISIBLE_PERIODS, que el scroll arranca en lo más reciente y
// que el tooltip no queda recortado por el contenedor.
// Uso: node tools/charts-e2e.mjs [urlBase] [carpetaCapturas]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4200';
const outDir = process.argv[3] ?? '.tmp-charts';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9500 + Math.floor(Math.random() * 400);
mkdirSync(outDir, { recursive: true });

const proc = spawn(chrome, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1440,1000', 'about:blank']);
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

const iso = (d) => d.toISOString().slice(0, 10);
const hace = (dias) => iso(new Date(Date.now() - dias * 86_400_000));

// Granularidad, rango, periodos visibles esperados (VISIBLE_PERIODS).
const CASOS = [
  { g: 'year', from: '2019-01-01', to: '2026-12-31', visibles: 5 },
  { g: 'month', from: '2025-01-01', to: '2026-09-30', visibles: 6 },
  { g: 'week', from: '2026-01-01', to: '2026-09-30', visibles: 6 },
  { g: 'day', from: '2026-04-01', to: '2026-09-30', visibles: 7 },
  // Rango por defecto (6 meses por mes): cabe entero, sin scroll.
  { g: 'month', from: '2026-04-01', to: '2026-09-30', visibles: 6 },
];

let fallos = 0;
const comprobar = (ok, texto) => {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${texto}`);
};

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
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      logs.push('error ' + JSON.stringify(msg.params.args).slice(0, 400));
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Page.navigate', { url: base + '/events/new' }, sessionId);
  await sleep(6000);

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (res.exceptionDetails) throw new Error(expression.slice(0, 120) + ': ' + JSON.stringify(res.exceptionDetails).slice(0, 300));
    return res.result?.value;
  };
  const escribir = async (selector, valor) => {
    const js =
      '(() => { const el = document.querySelector(' +
      JSON.stringify(selector) +
      '); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ' +
      JSON.stringify(valor) +
      '); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()';
    if (!(await evaluate(js))) throw new Error('no existe el campo ' + selector);
  };

  // 1) Movimientos en varios años, desde el formulario real (la base del modo
  //    navegador vive en memoria: se navega con el router, sin recargar).
  const movimientos = [
    ['48,60', hace(0), 'Mercadona'],
    ['54,20', hace(3), 'Gasolinera'],
    ['120,00', hace(70), 'Seguro coche'],
    ['310,00', hace(420), 'Portátil'],
    ['95,00', hace(1100), 'Dentista'],
  ];
  for (const [importe, fecha, concepto] of movimientos) {
    if (!(await evaluate('location.pathname === "/events/new"'))) {
      await evaluate(`document.querySelector('ft-sidebar a[href="/events"]').click()`);
      await sleep(2000);
      await evaluate(`document.querySelector('a[href="/events/new"]').click()`);
      await sleep(2200);
    }
    await escribir('ft-input-importe input', importe);
    await escribir('#fecha', fecha);
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

  // 2) Cada caso se fija por la facade de la pantalla (modo desarrollo: `ng`
  //    global), igual que harían los filtros.
  for (const c of CASOS) {
    await evaluate(`(() => {
      const page = ng.getOwningComponent(document.querySelector('ft-barra-filtros'));
      page.facade.setRange({ from: '${c.from}', to: '${c.to}' });
      page.facade.setGranularity('${c.g}');
    })()`);
    await sleep(1800);
    const medidas = await evaluate(`(() => {
      const medir = (sel) => {
        const host = document.querySelector(sel);
        const area = host?.querySelector('.area');
        if (!area) return null;
        return { client: area.clientWidth, scroll: area.scrollWidth, left: Math.round(area.scrollLeft) };
      };
      const s = ng.getOwningComponent(document.querySelector('ft-barra-filtros')).facade.snapshot();
      return {
        barras: medir('ft-grafico-comparativo'),
        saldo: medir('ft-grafico-saldo'),
        periodos: s.periods.length,
        puntosSaldo: '${c.g}' === 'day' ? s.daily.length : s.periods.length,
      };
    })()`);
    const { barras, saldo, periodos, puntosSaldo } = medidas;
    const tag = `${c.g.padEnd(5)} ${c.from}…${c.to}`;
    const esperadoBarras = Math.max(1, periodos / c.visibles);
    const esperadoSaldo = Math.max(1, (puntosSaldo - 1) / (c.visibles - 1));
    const ratioB = barras.scroll / barras.client;
    const ratioS = saldo.scroll / saldo.client;
    const alFinal = (m) => m.scroll <= m.client || Math.abs(m.left + m.client - m.scroll) <= 2;
    comprobar(
      Math.abs(ratioB - esperadoBarras) < 0.05,
      `${tag} barras: ${periodos} periodos, ancho ×${ratioB.toFixed(2)} (esperado ×${esperadoBarras.toFixed(2)} → ${Math.min(periodos, c.visibles)} a la vista)`,
    );
    comprobar(alFinal(barras), `${tag} barras: el scroll arranca en lo más reciente (left ${barras.left})`);
    comprobar(
      Math.abs(ratioS - esperadoSaldo) < 0.05,
      `${tag} saldo: ${puntosSaldo} puntos, ancho ×${ratioS.toFixed(2)} (esperado ×${esperadoSaldo.toFixed(2)})`,
    );
    comprobar(alFinal(saldo), `${tag} saldo: el scroll arranca en lo más reciente (left ${saldo.left})`);

    const rect = await evaluate(`(() => { const r = document.querySelector('ft-analytics .grid, .grid').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } }, sessionId);
    writeFileSync(join(outDir, `graficos-${c.g}-${c.from}.png`), Buffer.from(data, 'base64'));
  }

  // 3) Tooltip: el ratón sobre la última barra visible (día, scroll al final);
  //    el tooltip vive en <body>, así que el contenedor con scroll no lo corta.
  await evaluate(`(() => { const f = ng.getOwningComponent(document.querySelector('ft-barra-filtros')).facade; f.setRange({ from: '2026-04-01', to: '2026-09-30' }); f.setGranularity('day'); })()`);
  await sleep(1800);
  const punto = await evaluate(`(() => { const r = document.querySelector('ft-grafico-comparativo .area').getBoundingClientRect(); return { x: r.right - 40, y: r.y + r.height / 2 }; })()`);
  // Dos movimientos: ECharts decide el eje con el primero y pinta el tooltip con el siguiente.
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: punto.x - 6, y: punto.y }, sessionId);
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: punto.x, y: punto.y }, sessionId);
  await sleep(800);
  const tooltip = await evaluate(`(() => {
    const visible = (d) => { const s = getComputedStyle(d); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && d.getBoundingClientRect().width > 0; };
    const enBody = [...document.body.children].find((d) => d.tagName === 'DIV' && d.textContent.includes('Inversión') && visible(d));
    const enGrafico = [...document.querySelectorAll('ft-grafico-comparativo .grafico div')].find((d) => d.textContent.includes('Inversión'));
    const bajoRaton = document.elementFromPoint(${punto.x}, ${punto.y});
    const t = enBody;
    const r = t?.getBoundingClientRect();
    return {
      enBody: !!enBody,
      enGrafico: !!enGrafico,
      texto: t ? t.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80) : '',
      dentro: !!r && r.left >= 0 && r.right <= innerWidth && r.top >= 0,
      bajoRaton: bajoRaton ? bajoRaton.tagName + '.' + (bajoRaton.getAttribute('class') ?? '') + ' en ' + (bajoRaton.closest('[class]')?.className ?? '') : '(nada)',
      hijosBody: [...document.body.children].map((d) => d.tagName + (d.style.zIndex ? '[z' + d.style.zIndex + ']' : '')).join(' '),
    };
  })()`);
  comprobar(tooltip.enBody, `tooltip en <body>: ${tooltip.enBody ? tooltip.texto : '(no aparece)'}`);
  if (tooltip.enBody) comprobar(tooltip.dentro, 'el tooltip queda dentro de la ventana');
  else console.log('diagnóstico tooltip ' + JSON.stringify(tooltip));

  if (logs.length) console.log(['consola:', ...logs].join('\n'));
  console.log(fallos === 0 ? 'TODO OK' : `${fallos} FALLOS`);
  process.exitCode = fallos === 0 && logs.length === 0 ? 0 : 1;
} finally {
  proc.kill();
}
