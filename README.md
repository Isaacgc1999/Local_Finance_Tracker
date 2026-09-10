# Fintrack

Aplicación de escritorio de finanzas personales para un único usuario. **Local y sin conexión**: sin cuentas, sin nube, sin telemetría. Los datos viven en un fichero SQLite en tu equipo. La única llamada de red que la app puede hacer es a Ollama en `localhost:11434` para el informe semanal.

- Shell: [Tauri v2](https://v2.tauri.app) (webview del sistema, binario de pocos MB)
- UI: Angular 21 LTS, standalone, zoneless, signals
- Datos: SQLite vía `@tauri-apps/plugin-sql`
- Gráficos: ECharts (import directo, `echarts/core`)
- Diseño: `design/design_handoff_fintrack/` (fuente de verdad de lo visual)

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 22 o superior | build de Angular y CLI de Tauri |
| npm | 10 | dependencias |
| Rust (rustup) | estable, 1.77 o superior | compilar la shell de Tauri |
| Windows: Visual Studio Build Tools con "Desktop development with C++" y WebView2 (viene con Windows 11) | | enlazador MSVC |
| macOS: Xcode Command Line Tools (`xcode-select --install`) | | |
| Linux: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` | | |
| Ollama (opcional) | reciente | informes de IA |

Instalación de Rust: <https://rustup.rs>. Guía completa de prerrequisitos de Tauri: <https://v2.tauri.app/start/prerequisites/>.

## Arranque en desarrollo

```bash
npm install
npm run dev        # tauri dev: levanta ng serve en :4200 y abre la ventana nativa
```

Si `npm run dev` responde `failed to run 'cargo metadata' … program not found`, es que falta Rust:
instálalo desde <https://rustup.rs>, **abre una terminal nueva** (el instalador añade `~/.cargo/bin` al PATH)
y comprueba `cargo --version`. La primera compilación tarda varios minutos; las siguientes son inmediatas.

Solo la parte web, en un navegador (**modo demo**: SQLite en WebAssembly, en memoria; nada se guarda al recargar). Sirve para revisar las pantallas sin Rust:

```bash
npm start          # http://localhost:4200
```

**No hay datos de ejemplo en ningún modo.** Tanto la demo como la aplicación instalada arrancan vacías: solo existen las categorías y los ajustes por defecto, sin movimientos ni presupuestos, para que todo lo que muestran el dashboard, la analítica y la IA salga de lo que registra cada usuario.

En **Ajustes** se configuran los presupuestos (límites de gasto total, fijos, variables, ocio, suscripciones o por categoría, y objetivos de ahorro e inversión) y la moneda de visualización (euro o dólar; los importes no se convierten, solo cambia el símbolo). La tarjeta «Presupuestos» de Analítica muestra hasta dónde se ha llegado en cada uno.

Tests (dos vías: componentes y utilidades en jsdom; repositorios contra SQLite real en Node):

```bash
npm test           # Angular + Vitest (jsdom)
npm run test:node  # repositorios y migraciones sobre node:sqlite
npm run test:all
```

Probar el build real en el navegador (modo demo, sin Rust):

```bash
npm run build:demo
npm run serve:demo   # http://localhost:4300
```

Benchmark de la analítica con 10.000 movimientos (objetivo: menos de 16 ms por recálculo):

```bash
npm run bench
```

Captura de pantalla con viewport real (útil para comparar con el handoff en 390 / 768 / 1440):

```bash
node tools/screenshot.mjs http://localhost:4200/events/new captura.png 390 900
```

Se pueden encadenar varios clics antes de capturar separándolos con `;;` (por ejemplo abrir
la calculadora y cambiar a la pestaña Financiera).

Pruebas de extremo a extremo sobre el build demo (Chrome real, sin Rust ni Ollama):

```bash
node tools/export-e2e.mjs      # descarga y valida los tres formatos de exportación
node tools/fake-ollama.mjs 11434 ok   # servidor falso de Ollama, en otra terminal
node tools/ai-e2e.mjs informe.png     # registra un movimiento y genera el informe semanal
node tools/calc-e2e.mjs calc.png      # Ctrl+K, la operación del handoff y «Usar X en nuevo evento»
node tools/settings-e2e.mjs ajustes.png # categorías, ingresos, presupuesto y formato de fecha
```

Si el puerto 11434 ya está ocupado por un Ollama real, arranca el servidor falso en otro puerto
y pásaselo a la prueba: la cambia desde Ajustes antes de generar.

```bash
node tools/fake-ollama.mjs 11435 ok
node tools/ai-e2e.mjs informe.png http://localhost:4300 http://127.0.0.1:11435
```

## Atajos de teclado

| Atajo | Qué hace |
|---|---|
| `Ctrl/Cmd + K` | Abre y cierra la calculadora sobre la pantalla actual, sin perderla |
| `Esc` | Cierra la calculadora, los modales y los desplegables |
| `Ctrl/Cmd + Intro` | Guarda el formulario de evento |

Con la calculadora abierta y el foco fuera de un campo de texto, el teclado físico escribe en
ella: dígitos, `, . + - * /`, `Intro` (=), `Retroceso` y `Supr` (C).

## Compilar el ejecutable

```bash
npm run build:desktop
```

Los instaladores quedan en `src-tauri/target/release/bundle/`:

| SO | Salida |
|---|---|
| Windows | `nsis/Fintrack_0.1.0_x64-setup.exe` y `msi/Fintrack_0.1.0_x64_en-US.msi` |
| macOS | `dmg/Fintrack_0.1.0_aarch64.dmg` (o `x64`) y `macos/Fintrack.app` |
| Linux | `appimage/fintrack_0.1.0_amd64.AppImage` y `deb/fintrack_0.1.0_amd64.deb` |

Cada sistema compila su propio instalador (no hay compilación cruzada).

Si ya tenías Fintrack instalado, cierra la app y ejecuta el instalador nuevo encima: sustituye el
ejecutable y conserva tu `fintrack.db`.

Para ver por dentro la ventana real (errores de consola, CSP, estilos, conexión con Ollama y capturas de
cada pantalla) hay una variante de inspección que nunca se distribuye. Usa su propio identificador, así
que no toca tus datos ni choca con la app instalada si está abierta:

```bash
npx tauri build --no-bundle --config src-tauri/tauri.inspect.conf.json
node tools/tauri-inspect.mjs src-tauri/target/release/fintrack.exe capturas dashboard,events,analytics,ai,settings
npm run build:desktop   # vuelve a dejar el ejecutable de distribución
```

## Dónde está el fichero de datos

`fintrack.db` se crea en el directorio de datos de la aplicación:

| SO | Ruta |
|---|---|
| Windows | `%APPDATA%\com.fintrack.app\fintrack.db` |
| macOS | `~/Library/Application Support/com.fintrack.app/fintrack.db` |
| Linux | `~/.local/share/com.fintrack.app/fintrack.db` |

Desde Ajustes se puede cambiar la ubicación, crear copias de seguridad y restaurarlas. El fichero es SQLite estándar: se puede abrir con cualquier cliente.

## Copias de seguridad y fichero de datos

Todo se gestiona desde **Ajustes → Fichero de datos**, y las tres operaciones necesitan la ventana de Tauri (`npm run dev` o la aplicación instalada); en el modo demo del navegador aparecen deshabilitadas.

| Acción | Qué hace |
|---|---|
| **Crear copia de seguridad** | Escribe una copia consistente con `VACUUM INTO` sin cerrar la base de datos, en la ruta que elijas. El fichero sale compactado y con el WAL ya integrado. |
| **Restaurar desde archivo** | Valida el fichero elegido (integridad, tablas de Fintrack y versión de esquema) y solo entonces sustituye tus datos. Una copia de una versión anterior se acepta: las migraciones la ponen al día. |
| **Cambiar** | Mueve el fichero de datos a otra carpeta y apunta ahí la aplicación. El fichero anterior se conserva por si acaso. |

La copia es un SQLite estándar: se puede abrir con cualquier cliente, guardar en la nube que prefieras o restaurar en otro equipo.

## Ollama (informe semanal de IA)

1. Instala Ollama desde <https://ollama.com/download>.
2. Descarga el modelo por defecto:
   ```bash
   ollama pull llama3.1:8b
   ```
3. Arranca el servicio (`ollama serve`, o la app de escritorio de Ollama) y comprueba que responde en `http://127.0.0.1:11434`.
4. En Fintrack, Ajustes → Ollama → "Probar conexión". El modelo y el endpoint son configurables.

Para probar la pantalla de IA sin instalar Ollama hay un servidor que imita su API:

```bash
node tools/fake-ollama.mjs 11434 ok        # ok | invalid | nomodel | error500 | timeout
```

**Cuánto tarda.** El informe se genera en tu ordenador, así que el tiempo depende de tu máquina. Medido en CPU, sin tarjeta gráfica:

| Modelo | Lectura del prompt | Generación | Total |
|---|---|---|---|
| `llama3.1:8b` (por defecto) | 22 s | 84 s | unos 1 min 45 s |
| `llama3.2:3b` | 20 s | 46 s | unos 1 min 10 s |

El modelo se precarga al abrir la pantalla de IA y queda 30 minutos en memoria, así que el informe no paga la carga inicial. Casi todo el tiempo es la generación, que depende de la CPU: con una GPU es mucho más rápido, y el modelo de 3B es la opción rápida en un equipo sin GPU. Para usarlo, descárgalo con `ollama pull llama3.2:3b` y elígelo en Ajustes → Ollama.

**Otros modelos.** Ajustes → Ollama lista todo lo que tengas descargado, así que puedes usar el que quieras. Ten en cuenta cuánta memoria piden los más recientes de Meta: Llama 4 Scout (`llama4:scout`) ocupa 67 GB, Llama 3.3 solo existe en 70B (de 26 a 43 GB) y Muse Glimmer 30B (`muse-glimmer`) ocupa 18 GB. El modelo tiene que caber entero en la RAM, o en la memoria de la GPU. Con 16 GB, los Llama más recientes que funcionan son `llama3.1:8b` y `llama3.2:3b` (ADR-080).

Fintrack no corta la generación mientras el modelo escriba: solo cancela si se queda callado 30 segundos a mitad, si tarda más de 3 minutos en empezar o si pasa de 8 minutos en total. Para medir tu propio equipo:

```bash
FT_AI_BENCH=1 npx vitest run --config vitest.node.config.ts scripts/ai-bench.spec.ts
FT_AI_BENCH=1 FT_AI_MODEL=llama3.2:3b npx vitest run --config vitest.node.config.ts scripts/ai-bench.spec.ts
```

Fintrack nunca envía movimientos en bruto: construye un resumen compacto de la semana (totales por categoría, comparativa con las 4 semanas previas, suscripciones activas, tasa de ahorro, desviaciones) y solo eso llega al modelo, que corre en tu máquina.

## Qué está verificado y qué no

Verificado:

- Compilación de producción sin avisos y las dos vías de tests en verde.
- Las cuatro pruebas de extremo a extremo de `tools/` sobre el build servido en un Chrome real: exportación en los tres formatos, calculadora, ajustes e informe de IA.
- **Informe de IA contra Ollama real** con Llama 3.1 8B: la semana se resume, el modelo responde, el JSON valida y la pantalla pinta veredicto, hallazgos, recomendaciones y potencial de ahorro coherentes.
- **`npm run build:desktop` en Windows** con Rust 1.98.1: compila sin avisos y produce `fintrack.exe` (8,6 MB), el MSI (4,8 MB) y el instalador NSIS (3,9 MB).
- **Arranque del ejecutable**: abre la ventana y crea `%APPDATA%\com.fintrack.app\fintrack.db` en modo WAL, con las seis tablas, el esquema en la versión 2, las 10 categorías de la semilla, los 7 ajustes y cero movimientos.

Todavía **sin comprobar**, porque hace falta usar la ventana a mano:

- el diálogo nativo de guardado al exportar,
- las tres operaciones de **Ajustes → Fichero de datos** (copia, restauración y cambio de ubicación), aunque su parte SQL sí está cubierta con SQLite real en `src/app/data/db/backup.node.spec.ts`,
- los adjuntos de los movimientos, que se escriben en disco,
- los instaladores de macOS y Linux, que cada sistema tiene que compilar por su cuenta.

## Decisiones técnicas

Las decisiones por fase están en [`docs/decisiones.md`](docs/decisiones.md) y el plan completo en [`docs/FASE-0.md`](docs/FASE-0.md).

**Formularios: Reactive Forms tipados en lugar de Signal Forms.** En Angular 21.2 el paquete `@angular/forms/signals` sigue marcado como experimental. Por la regla del proyecto ("si signal forms está estable, úsalos; si no, Reactive Forms tipados") se usan `FormGroup`/`FormControl` tipados, y su valor se expone como signal con `toSignal(form.valueChanges)` para que todo el estado derivado siga siendo `computed()`.

## Estructura

```
src/app/core       tipos (Money, IsoDate, Result), formato es-ES, errores
src/app/data       SQLite: apertura, migraciones, repositorios
src/app/domain     servicios puros (recurrencias, analítica, IA, exportación)
src/app/infra      adaptadores Tauri (Ollama, ficheros, breakpoints)
src/app/facades    estado en signals que consumen las pantallas
src/app/layout     Shell, Sidebar, TabBar, FAB, CabeceraPagina
src/app/shared     componentes del handoff, directiva [chart], pipes
src/app/features   dashboard, events, analytics, ai, calculator, settings
src/styles         tokens del handoff como custom properties
src-tauri          shell de escritorio (Rust)
design             handoff de diseño
```
