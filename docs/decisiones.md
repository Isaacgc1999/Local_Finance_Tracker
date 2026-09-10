# Decisiones técnicas (ADR)

Formato: contexto → decisión → consecuencias. Una entrada por decisión, agrupadas por fase.

## Fase 1 — Andamiaje

### ADR-001 · Angular 21 LTS, no 22
**Contexto.** El stack exige Angular 21; la última versión publicada es 22.1.
**Decisión.** Fijar `~21.2.22` (línea `v21-lts`) y TypeScript `~5.9`.
**Consecuencias.** Sin acceso a novedades de 22. `resource()` sigue `@experimental` en 21.2 y no se usa; `linkedSignal` es `@publicApi` y sí.

### ADR-002 · Reactive Forms tipados en vez de Signal Forms
**Contexto.** `@angular/forms/signals` es experimental en 21.2.
**Decisión.** Formularios con `FormGroup` tipado; el valor se expone como signal con `toSignal(valueChanges)`.
**Consecuencias.** Todo el estado derivado sigue en `computed()`. Migrar a Signal Forms cuando sea estable será un cambio localizado en `EventFormFacade`.

### ADR-003 · vitest 4.0.x
**Contexto.** `vitest@4.1.x` rompe el resolutor de npm 10.9.8 (`Cannot read properties of null (reading 'edgesOut')`), reproducido aislando el paquete.
**Decisión.** Fijar `~4.0.8` hasta que npm o vitest publiquen arreglo.
**Consecuencias.** Ninguna funcional: `@angular/build:unit-test` funciona con 4.0.

### ADR-004 · Handoff fuera de `public/`
**Contexto.** Angular copia `public/` al build; el prototipo (280 KB + React por CDN) acabaría dentro del ejecutable.
**Decisión.** Mover a `design/design_handoff_fintrack/`.
**Consecuencias.** El handoff sigue en el repo como referencia; no se distribuye.

### ADR-005 · Breakpoints por ResizeObserver sobre el Shell
**Contexto.** Regla: nada de listeners de `window`. Los layouts son tres (≤640, 641–1023, ≥1024).
**Decisión.** `BreakpointService` observa el elemento raíz del Shell y publica `current`, `isMobile`, `isTablet`, `isDesktop` como signals. Las media queries SCSS (`ft-media`) cubren el CSS puro; las signals cubren la estructura (sidebar vs tab bar, FAB).
**Consecuencias.** Un único observer para toda la app. Los componentes no consultan `window`.

### ADR-006 · Tokens como custom properties + mapa SCSS de breakpoints
**Contexto.** Los tokens deben salir del handoff y poder redefinirse por breakpoint. `var()` no funciona en media queries.
**Decisión.** Todo token en `:root` (`_tokens.scss`), redefinición por rango en `_breakpoints.scss`; los anchos de corte viven en `$ft-breakpoints`.
**Consecuencias.** Los componentes solo usan `var(--ft-*)`; cambiar un valor del handoff es un cambio en un fichero.

### ADR-007 · Controles nativos con clases globales, no componentes
**Contexto.** Botones, inputs, selects y textareas aparecen en todas las pantallas; el handoff solo define sus medidas y estados.
**Decisión.** Elementos nativos con `.ft-btn`, `.ft-input`, `.ft-select`, `.ft-textarea`, `.ft-link` en `_controls.scss`. Los componentes propios se reservan para lo que el handoff nombra (chip, segmented, toggle, input de importe…).
**Consecuencias.** Menos código, foco y semántica nativos, presupuestos de estilo por componente holgados.

### ADR-008 · Rutas lazy + precarga en idle
**Contexto.** App de escritorio servida desde disco: el coste es parseo de JS, no red.
**Decisión.** `loadComponent` por pantalla y `withPreloading(PreloadAllModules)`.
**Consecuencias.** Arranque con 259 kB iniciales (medido en Fase 1); el resto llega en idle.

### ADR-009 · Permisos de Tauri mínimos y HTTP solo a Ollama
**Contexto.** Regla: cero red salvo `localhost:11434`. En Windows el origen del webview (`http://tauri.localhost`) no está en `OLLAMA_ORIGINS` por defecto.
**Decisión.** `@tauri-apps/plugin-http` con scope `http://127.0.0.1:11434/*` y `http://localhost:11434/*` en `capabilities/default.json`; CSP con `connect-src 'self' ipc: http://ipc.localhost`.
**Consecuencias.** La restricción de red la impone la shell, no solo el código TS.

### ADR-010 · Icono placeholder generado
**Contexto.** El handoff no incluye icono de aplicación (README: "ninguna imagen").
**Decisión.** Cuadrado del color de acento con esquinas redondeadas (proporción del logo de 28px/r8), generado por script y convertido con `tauri icon`.
**Consecuencias.** Sustituible en cualquier momento regenerando `src-tauri/icons/`.

## Fase 2 — Capa de datos

### ADR-011 · Comando Rust `db_transaction` sobre el pool de plugin-sql
**Contexto.** `tauri-plugin-sql` abre un pool sqlx de varias conexiones; `BEGIN`/`COMMIT` en llamadas `execute()` separadas no son atómicos. `DbInstances` y `DbPool::Sqlite` son públicos en el plugin.
**Decisión.** Comando propio (`src-tauri/src/db_tx.rs`) que toma una conexión del pool del plugin y ejecuta todas las sentencias entre `BEGIN IMMEDIATE` y `COMMIT` con `ROLLBACK` ante error. En JS, `DatabaseHandle.transaction()` es la única vía de escritura y devuelve `Result`.
**Consecuencias.** Lecturas por el plugin, escrituras por el comando; `sqlx 0.8` pasa a ser dependencia directa. Pendiente de `cargo check` hasta que haya Rust en la máquina.

### ADR-012 · Segunda vía de tests con `node:sqlite`
**Contexto.** Los repositorios deben probarse contra SQLite real (CHECK, índices únicos parciales, FK). `ng test` empaqueta para navegador y no puede importar `node:sqlite`.
**Decisión.** `NodeSqliteDatabase` en `tools/` implementa `DatabaseHandle`; los specs `*.node.spec.ts` corren con `vitest --config vitest.node.config.ts` (`npm run test:node`) y quedan excluidos de `ng test`.
**Consecuencias.** Mismo SQL en tests y producción. Node 22.22 trae `node:sqlite` sin flag (con aviso experimental, silenciado en el setup).

### ADR-013 · Tamaño del fichero por PRAGMA, no por `fs.stat`
**Contexto.** Si el usuario cambia la ubicación del `.db`, esa ruta queda fuera del scope de `plugin-fs` al reiniciar.
**Decisión.** `SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()`; no se necesita permiso de ficheros para mostrar «2,41 MB».
**Consecuencias.** La copia de seguridad (Fase 9) usará `VACUUM INTO` por la misma razón.

### ADR-014 · Puntero de ubicación en appData
**Contexto.** «Cambiar» ruta del fichero necesita persistir la ruta fuera de la propia BD.
**Decisión.** Fichero de texto `fintrack.location` en appData (`plugin-fs`, scope appData). Sin él, `appData/fintrack.db`. Ruta absoluta pasada a `Database.load('sqlite:<ruta>')`.
**Consecuencias.** No se usa localStorage ni similar. `plugin-sql` resuelve rutas relativas contra appConfigDir, por eso siempre absoluta.

### ADR-015 · Redondeo de dinero «half away from zero»
**Contexto.** `mulMoney`/`divMoney` producen fracciones de céntimo (21 %, ÷ 30 personas).
**Decisión.** Redondeo al céntimo alejándose de cero, el criterio bancario habitual en España. Proporciones en puntos básicos enteros (`ratioBasisPoints`) y `null` ante divisor 0.
**Consecuencias.** Coincide con los ejemplos del handoff (506,66 € y 62,81 €). Solo se redondea al mostrar o al cerrar una operación, nunca en acumuladores.

### ADR-016 · `resource()` descartado en 21.2
**Contexto.** Verificado en `@angular/core` 21.2.22: `resource` está `@experimental`.
**Decisión.** Las facades cargan con métodos `async` que escriben en signals (`AppStatusFacade.start()` es el patrón).
**Consecuencias.** Migración trivial a `resource()` cuando sea estable.

## Fase 3 — Formulario, recurrencias y listado

### ADR-017 · Modo demo en navegador con sql.js (solo desarrollo)
**Contexto.** Sin Rust no se puede abrir la ventana de Tauri, y `ng serve` mostraba siempre la tarjeta de error: ni el usuario ni el asistente podían ver las pantallas con datos.
**Decisión.** `SqlJsDatabase` (SQLite en WebAssembly, en memoria) implementa el mismo `DatabaseHandle`, con las mismas migraciones y una semilla determinista inspirada en el handoff. Se activa solo cuando `FT_BROWSER_DEMO` es `true` (constante `define` de esbuild en la configuración `development`); en `production` y `test` es `false`, la rama se elimina y `sql.js` no entra en el bundle (verificado: no hay chunk).
**Consecuencias.** Revisión visual posible sin Rust. Los datos de demo no se guardan (aviso en pantalla). Cuando exista Rust, la app sigue prefiriendo Tauri (`isTauri()` se comprueba primero).

### ADR-018 · Estrategia por tipo como configuración, no como seis componentes
**Contexto.** Regla: «un contenedor + estrategia por tipo, NO seis formularios copiados».
**Decisión.** `FORM_STRATEGIES` (dominio, puro) declara por tipo los campos visibles, etiquetas, color del importe, tipo de categoría y modo de recurrencia. `EventFormFacade.applyStrategy()` activa/desactiva los `FormControl` y `validateEventDraft()` aplica las reglas del handoff (importe > 0, categoría en gasto, ticker en inversión).
**Consecuencias.** Añadir un tipo o un campo es una entrada de configuración. Un solo template con `@if (facade.visible(campo))`.

### ADR-019 · Gasto recurrente = naturaleza fija; edición de instancias no toca la regla
**Contexto.** Las reglas no tienen columna `nature`; una fila materializada de una regla puede editarse a mano.
**Decisión.** `instanceDraft()` asigna `nature = 'fixed'` a las instancias de reglas de tipo gasto. Al editar una instancia el bloque de recurrencia queda bloqueado con la nota «Edita o desactiva la regla desde Ajustes» (Fase 9); el tipo tampoco se cambia al editar.
**Consecuencias.** La edición manual gana siempre (índice único regla+fecha) y nunca regenera la fila.

### ADR-020 · Recarga por señal de versión de datos
**Contexto.** Tras guardar, borrar o materializar, las listas deben refrescarse sin acoplar facades entre sí.
**Decisión.** `AppStatusFacade.dataVersion` es una signal entera que `touch()` incrementa; `EventsFacade` la lee en un `effect` junto con mes y filtros y recarga con `untracked`.
**Consecuencias.** Patrón reutilizable en Dashboard y Analítica (Fases 4 y 5).

### ADR-021 · Adjuntos copiados a appData/attachments
**Contexto.** El fichero elegido en el diálogo queda fuera del scope de fs tras reiniciar.
**Decisión.** Se copia a `appData/attachments/<uuid>.<ext>` (scope appData permanente); se valida tipo (PNG/JPG/PDF) y tamaño (8 MB, handoff). En modo demo los adjuntos no están disponibles (aviso).
**Consecuencias.** Borrar un movimiento borra su adjunto.

## Fase 4 — Dashboard

### ADR-022 · Balance del mes = ingresos − gasto (ahorro e inversión no restan)
**Contexto.** FASE-0 §f proponía restar también ahorro e inversión; los datos del handoff dicen lo contrario (2.752,68 − 1.884,37 = +868,31 con 400 € de ahorro y 250 € de inversión).
**Decisión.** `balanceOf()` = ingresos − (gastos + suscripciones + domiciliaciones). Ahorro e inversión son traspasos y se muestran como KPI propios.
**Consecuencias.** Coherente con «68,5 % de los ingresos · quedan 868,31 €». Se corrige la firma de FASE-0.

### ADR-023 · ECharts solo para los gráficos con datos; sparklines en SVG
**Contexto.** El handoff dibuja las sparklines como `<polyline>` de 100×28 y el donut y las barras como elementos de layout.
**Decisión.** Barras semanales y donut van por ECharts (renderer SVG, directiva `[chart]` con ResizeObserver, tooltip con la caja de 196px del handoff); las sparklines de las KPI son SVG inline (100×28, trazo 1,6) porque no tienen interacción ni ejes. Esquinas redondeadas «solo en el conjunto» resueltas con `borderRadius` por dato en el segmento superior e inferior de cada pila.
**Consecuencias.** `echarts/core` + BarChart/LineChart/PieChart/Grid/Tooltip/SVGRenderer registrados una vez en `shared/charts/echarts.ts`; la paleta TS (`palette.ts`) espeja los tokens SCSS.

### ADR-024 · Proyección de cierre en la KPI «Gastos» (estado error)
**Contexto.** FASE-0 §g-18: la barra sigue al handoff (base = ingresos) y el aviso de burn rate contra el presupuesto objetivo necesita un sitio.
**Decisión.** `computeBudgetPace()` extrapola el gasto al cierre solo en el mes en curso; si supera el objetivo, la KPI «Gastos» adopta el estado error del handoff con el pie «Proyección X · supera el objetivo». Sin ingresos, la barra usa el presupuesto objetivo como base y lo dice en el pie.
**Consecuencias.** A principios de mes la proyección es volátil (día 1–3); es el comportamiento pedido, revisable en Fase 5 si molesta.

### ADR-025 · Layout 768 sin donut ni próximos cargos
**Contexto.** El frame 768 del handoff solo tiene hero, KPI, presupuesto, gasto por semana y movimientos.
**Decisión.** Se respeta el frame: en tablet no se renderizan `DesgloseTipoGasto` ni `ProximosCargos`; en 390 tampoco (frame 390 igual).
**Consecuencias.** Esa información sigue disponible en Analítica (Fase 5) y en escritorio.

## Fase 5 — Analítica

### ADR-026 · `computeSnapshot()` en una pasada, con memoización por signals
**Contexto.** La pantalla debe recalcular por debajo de 16 ms con 10.000 movimientos.
**Decisión.** Un único recorrido O(n) con acumuladores enteros (por periodo, por día, por categoría, periodo anterior y 3 periodos previos), más una ordenación para la mediana. La clave de periodo por fecha se memoriza (las fechas se repiten). La facade solo entrega el snapshot como `computed()`, así que nada se recalcula si no cambia una entrada.
**Consecuencias.** Benchmark (`npm run bench`, SQLite real + repositorio): mediana 3–6 ms en las cuatro granularidades; p95 < 9 ms.

### ADR-027 · Semana ISO en aritmética pura; `date-fns` retirado
**Contexto.** La granularidad semanal tardaba 39 ms porque cada clave pasaba por `Date` y date-fns.
**Decisión.** `isoWeek()` se calcula sobre días UTC (jueves de la semana → año ISO → nº de semana), verificado por tests con años de 53 semanas. `date-fns` deja de usarse y se desinstala.
**Consecuencias.** Sin dependencias de fechas; `Date` solo aparece dentro de `iso-date.ts`.

### ADR-028 · Historia cargada junto al rango, filtros en cliente
**Contexto.** La varianza necesita 3 periodos previos, la comparativa el periodo anterior y el saldo acumulado todo lo anterior.
**Decisión.** La facade carga `[min(inicio − 3 periodos, periodo anterior), fin]` en una consulta y el saldo inicial con `SUM(amount) GROUP BY type WHERE date < inicio`. Categorías y tipos se filtran en cliente sobre el array cargado (O(n)) y solo se relee la BD si el rango pedido no cabe en el cargado o cambian los datos.
**Consecuencias.** Cambiar de granularidad o de filtros no toca la base de datos.

### ADR-029 · Media móvil según granularidad (FASE-0 g-16)
**Decisión.** En Día se dibujan las medias de 7 y 30 días sobre la serie diaria; en Semana / Mes / Año, la media móvil de 3 periodos que muestra el handoff. El snapshot expone las tres siempre.

### ADR-030 · «Varianza vs. media» como delta relativo (FASE-0 g-17)
**Decisión.** La tarjeta muestra `(gasto del último periodo − media de los 3 anteriores) / media` con flecha y color por signo; varianza y desviación típica viajan en el snapshot para la IA y la exportación.

### ADR-031 · Objetivo de tasa de ahorro derivado
**Decisión.** `objetivo = (ingresos medios de los 6 meses anteriores − presupuesto objetivo) / ingresos medios`, como enuncia el pie de Ajustes en el handoff («sobre unos ingresos medios de 2.557,13 €, deja una tasa de ahorro objetivo del 31,6 %»). Sin ingresos previos, «sin objetivo».

### ADR-032 · Exportación por diálogo nativo
**Contexto.** El handoff dice «se escribe en la carpeta de descargas»; las reglas técnicas piden diálogo nativo de Tauri con nombre por defecto `fintrack-YYYY-MM.{ext}`.
**Decisión.** Manda la regla técnica: el subtítulo del modal pasa a «Elige dónde guardarlo con el diálogo de tu sistema». El generador de ficheros llega en la Fase 6; el modal y el menú ya están construidos.

## Fase 6 — Exportación

### ADR-033 · Un solo modelo de exportación para los tres formatos
**Contexto.** La regla exige el MISMO contenido en Excel, PDF y Word.
**Decisión.** `buildExportModel()` (puro, determinista) produce portada, resumen, gráficos, desglose por tipo de gasto, tabla de categorías y listado de movimientos. Los tres exportadores solo cambian el envoltorio. `buildDocument()` carga cada librería con `import()` dinámico.
**Consecuencias.** Un cambio de contenido se hace una vez. jsPDF (411 kB) solo entra en el bundle si el usuario exporta a PDF.

### ADR-034 · Gráficos rasterizados desde SVG a PNG 2x
**Contexto.** Los gráficos usan el renderer SVG (ADR-023) y `getDataURL({type:'png'})` no rasteriza en ese renderer: producía «wrong PNG signature» en el PDF y un `atob` inválido en Word. Lo detectó la prueba de extremo a extremo, no los tests unitarios.
**Decisión.** `chartToPng()` serializa el SVG de la instancia y lo pinta en un canvas del doble de tamaño (2x, como pide el handoff), sobre el fondo de tarjeta de la app para conservar la paleta semántica. Sin dependencias nuevas y sin cambiar el renderer de pantalla.
**Consecuencias.** La función es asíncrona; `runExport` la espera. Excel no lleva imágenes (SheetJS no escribe dibujos en xlsx): a cambio incluye el desglose numérico que las alimenta.

### ADR-035 · Excel con números, formato de moneda real y fórmulas con valor cacheado
**Decisión.** Los importes se escriben como números con `numFmt` es-ES (`#.##0,00 "€"`, negativos en rojo); las filas de totales llevan `SUM()` viva y además el valor precalculado, para que cualquier lector muestre el total aunque no recalcule. `amount_cents / 100` ocurre solo en la frontera de exportación.

### ADR-036 · Guardado por diálogo nativo, con descarga en el modo demo
**Decisión.** `saveBinaryFile()` usa `plugin-dialog` + `plugin-fs` dentro de Tauri y, fuera (modo demo del navegador), descarga con un enlace temporal. Nombre por defecto `fintrack-YYYY-MM.ext` (o `fintrack-YYYY-MM_YYYY-MM.ext` para rangos de varios meses).

### ADR-037 · Verificación de la exportación contra el build real, no contra el dev server
**Contexto.** En `ng serve`, vite reoptimiza dependencias al cargar jsPDF por primera vez y **recarga la página**, abortando la exportación sin error visible.
**Decisión.** Configuración de build `demo` (producción + modo demo) servida con `tools/serve-static.mjs`, y `tools/export-e2e.mjs` que pulsa Exportar en un Chrome real y valida el fichero descargado. Los tests de Node verifican además el contenido: el Excel se relee con SheetJS y del PDF se extrae el texto inflando sus streams.
**Consecuencias.** `npm run build:demo` + `npm run serve:demo` permiten probar la app compilada sin Rust.

## Fase 7 — Integración con Ollama

### ADR-038 · El esquema Zod genera el JSON Schema que se envía al modelo
**Contexto.** La regla pide `format: json` y validación con Zod; Ollama admite además un JSON Schema completo (structured outputs), más fuerte que `'json'`.
**Decisión.** `reportSchema` (Zod 4) es la única fuente de verdad: `z.toJSONSchema()` produce el `format` de la petición y el mismo esquema valida la respuesta.
**Consecuencias.** Un cambio de contrato se hace en un sitio. Si el modelo ignora el esquema, la validación lo detecta igual.

### ADR-039 · Contexto compacto, nunca movimientos en crudo
**Decisión.** `buildWeeklySummary()` envía totales por tipo y categoría con su media de las 4 semanas anteriores, top 5 de gastos, suscripciones activas normalizadas a coste mensual, tasa de ahorro y desviaciones detectadas. Todo en céntimos enteros para que el modelo devuelva `amount_cents` sin inventar decimales. Un test comprueba que el JSON enviado no contiene identificadores ni notas.

### ADR-040 · Reintento único con el error inyectado, y fallback local
**Decisión.** Si la respuesta no valida, se reintenta una vez añadiendo la respuesta fallida y el error concreto al prompt. Si vuelve a fallar, el informe se guarda con estado `failed` y la pantalla muestra la tarjeta de error del handoff más «Tus métricas de la semana», calculadas en local. La app nunca se queda en blanco por una alucinación.
**Consecuencias.** El parser corrige además dos incoherencias frecuentes: importes de hallazgo negativos y un potencial de ahorro que no cuadra con las recomendaciones.

### ADR-041 · Progreso estimado con la duración del informe anterior
**Contexto.** El streaming de Ollama no informa del total (FASE-0 §g-22).
**Decisión.** La barra avanza con `tiempo transcurrido / duración del último informe completado`, con tope del 90 %; sin informe previo se usa la barra indeterminada con el barrido `shim` del handoff. El contador muestra los movimientos leídos y el tiempo, como en el diseño.

### ADR-042 · Lista de modelos vacía significa modelo no descargado
**Contexto.** La primera versión solo marcaba `model_missing` si `/api/tags` devolvía algún modelo; con Ollama recién instalado (lista vacía) la pantalla decía «Conectado». Lo detectó la prueba con el servidor falso.
**Decisión.** Si la consulta tiene éxito y el modelo configurado no está en la lista, el estado es `model_missing` con el comando `ollama pull` en pantalla. Solo si la consulta falla se deja el estado como estaba.

### ADR-043 · Servidor falso de Ollama para verificar los cinco estados
**Decisión.** `tools/fake-ollama.mjs` imita `/api/version`, `/api/tags` y `/api/chat` con streaming NDJSON y admite los modos `ok`, `invalid`, `nomodel`, `error500` y `timeout`. `tools/ai-e2e.mjs` pulsa «Generar análisis» en un Chrome real contra el build demo y comprueba el resultado.
**Consecuencias.** Los cinco estados de la pantalla se verifican sin tener Ollama ni el modelo instalados.

## Fase 8 — Calculadora

### ADR-044 · La calculadora es un panel del layout, nunca una ruta
**Contexto.** El handoff es explícito: «el panel **no puede ser una ruta**, porque desmontaría la vista de detrás».
**Decisión.** `CalculatorFacade` (`providedIn: 'root'`) guarda `open`, `tab`, el estado del motor y las entradas de la pestaña financiera. El `Shell` monta `PanelLateral` + `Calculadora` dentro de un bloque `@defer (when calc.open(); prefetch on idle)`, hermano del `<router-outlet>`. Abrir la calculadora no toca el router.
**Consecuencias.** La vista de detrás conserva su estado (mes seleccionado, filtros, scroll) y sigue viva. El código de la calculadora viaja en su propio chunk de 16 kB que se descarga en el primer hueco libre.

### ADR-045 · El importe viaja a `/events/new` en céntimos enteros
**Contexto.** El handoff prohíbe pasarlo «por query param **formateado**» y propone estado de router o servicio.
**Decisión.** Se navega a `/events/new?amount=6281`: céntimos enteros, la misma representación que usa toda la capa de dominio, nunca «62,81 €». Lo lee `EventForm` con `withComponentInputBinding()`.
**Consecuencias.** Se cumple la prohibición (no hay texto localizado en la URL) y además el formulario sobrevive a una recarga, cosa que el estado de router no permite. Verificado de extremo a extremo en `tools/calc-e2e.mjs`.

### ADR-046 · Ctrl/Cmd+K se escucha en el documento, desde el `Shell`
**Decisión.** Un `host: { '(document:keydown)': … }` en el `Shell` alterna el panel con Ctrl+K o Cmd+K en cualquier ruta, también con el foco dentro del propio panel. La `Calculadora` ignora los eventos con modificador, así que el atajo nunca compite con el teclado de la calculadora. Escape cierra el panel; por eso `keyFromKeyboard('Escape')` devuelve `null` y es `Delete` quien mapea a `C`.
**Consecuencias.** Los botones «Calculadora» del dashboard llevan `title` y `aria-keyshortcuts` (FASE-0 §g-15), única pista visual añadida.

### ADR-047 · Por debajo de 1024 px el panel flota en vez de estrujar el contenido
**Contexto.** El frame de 1440 dibuja el panel como tercera columna con el dashboard al 45 % a su izquierda. El frame de 768 solo dibuja el panel, sin decir qué pasa detrás.
**Decisión.** En escritorio el panel es un hermano en la fila principal (el contenido se reduce a 800 px y se atenúa al 45 %, como el handoff). En tablet ocupa los mismos 400 px pero en posición fija sobre un velo, y en móvil es la hoja modal con asa de 40×4. En 768 el contenido restante serían 368 px, ancho en el que la rejilla de tarjetas se rompe.
**Consecuencias.** Los tres frames del handoff se reproducen tal cual y ningún ancho intermedio degrada la vista de detrás.

### ADR-048 · Los operandos de la expresión se muestran tal como se teclean
**Contexto.** El display del handoff pone `1.884,37 ÷ 30 =`, no `1.884,37 ÷ 30,00 =`.
**Decisión.** El motor guarda el texto tecleado de cada operando (`leftText` / `rightText`) además de su valor en céntimos. El resultado sí se normaliza a dos decimales.
**Consecuencias.** La línea de operación y las filas del historial coinciden literalmente con el diseño. Cubierto por un test unitario y por la prueba de extremo a extremo.

### ADR-049 · La pestaña financiera comparte el historial y añade un enlace para guardar
**Contexto.** El historial del handoff incluye `21 % de 2.412,68 → 506,66`, que solo puede venir de la pestaña financiera, pero esa pestaña no dibuja ningún botón que lo produzca.
**Decisión.** `CalculatorEngine.record()` añade una operación al historial sin tocar el display, y la caja de resultado ofrece un enlace discreto «Guardar en el historial». Es el único elemento que se añade al diseño, y es el mínimo necesario para que el contenido que el propio handoff muestra sea alcanzable.
**Consecuencias.** No se guarda nada de forma automática, así que teclear en los campos no llena el historial de resultados intermedios.

### ADR-050 · Modos «% de importe» y «Dividir» sobre la anatomía del interés compuesto
**Contexto.** FASE-0 §6: los otros dos modos solo existen como chips, sin frame propio.
**Decisión.** Los tres reutilizan la misma rejilla de campos de 44 px más la caja de resultado. «% de importe» y «Dividir» muestran la cifra en `text-1`; el interés compuesto la muestra en `investment` con «Aportado» e «Intereses» en verde, exactamente como el frame de 768. En 390 la rejilla pasa a una columna.
**Consecuencias.** Ningún modo inventa componentes nuevos.

## Fase 9 — Ajustes, copias de seguridad y empaquetado

### ADR-051 · La copia de seguridad se hace con `VACUUM INTO`, no copiando ficheros
**Contexto.** La base de datos está abierta y en modo WAL: copiar el `.db` con el sistema de ficheros deja fuera el contenido del `-wal` y puede capturar una escritura a medias.
**Decisión.** `VACUUM INTO '<destino>'` escribe un fichero nuevo, ya compactado y con el WAL integrado, sin cerrar la conexión. Es la forma que recomienda SQLite para copiar en caliente. El destino no puede existir, así que borrarlo es un paso explícito después de que el diálogo nativo haya pedido confirmación.
**Consecuencias.** No hay ventana en la que la copia sea inconsistente y el fichero resultante suele ser más pequeño que el original. Verificado con SQLite real en `backup.node.spec.ts`, incluyendo que el original sigue usable después.

### ADR-052 · Restaurar valida la copia antes de tocar nada
**Contexto.** «Restaurar desde archivo» sustituye todos los datos del usuario por los de un fichero que elige a mano.
**Decisión.** El candidato se abre en una segunda conexión y se comprueba en este orden: `PRAGMA integrity_check`, presencia de las cuatro tablas obligatorias y versión de esquema no superior a la que entiende esta compilación. Solo si pasa las tres se cierra la conexión activa y se sustituye el fichero. Una copia de una versión anterior sí se acepta: las migraciones la ponen al día al reabrir.
**Consecuencias.** Un `.txt` renombrado a `.db` ni siquiera llega a la validación (SQLite lo rechaza al abrirlo) y una base de datos ajena se rechaza con un mensaje concreto. Cinco tests cubren los casos.

### ADR-053 · Al restaurar se borran el `-wal` y el `-shm` del destino
**Contexto.** SQLite reaplica el WAL que encuentra junto a un fichero al abrirlo.
**Decisión.** `replaceDatabaseFile()` borra los dos ficheros auxiliares del destino antes de copiar encima. Sin ese paso, el WAL de la base anterior se aplicaría sobre la copia recién restaurada y la dejaría inconsistente.
**Consecuencias.** Es el detalle que hace que restaurar sea seguro; queda documentado porque no es evidente al leer el código de copia.

### ADR-054 · `PreferencesService`: las preferencias son signals de raíz
**Contexto.** `dateFormat` se guardaba pero no lo leía nadie: cambiarlo en Ajustes no se veía en ninguna pantalla.
**Decisión.** Un servicio de raíz carga los ajustes cuando la base de datos está lista y los refresca con cada `touch()`. Expone `dateFormat`, `budgetTarget` y `currency` como `computed`. Lo consumen el selector de rango de Analítica y el modelo de exportación.
**Consecuencias.** El cambio se propaga sin recargar. El alcance real del ajuste es pequeño y conviene decirlo: casi todas las fechas de la interfaz se escriben en formato largo («9 sep», «Septiembre 2026»), que no depende de esta preferencia. Solo cambian el rango de Analítica y el periodo de los documentos exportados.

### ADR-055 · La sección de Ollama de Ajustes no comparte estado con la pantalla de IA
**Contexto.** Las dos tienen pill de estado, modelo y endpoint.
**Decisión.** `SettingsFacade` tiene su propio `OllamaClient`. En Ajustes se prueba una configuración que todavía se está editando; en la pantalla de IA se refleja la que está guardada. Al guardar el endpoint o el modelo, el `touch()` hace que `AiFacade` recargue por su cuenta.
**Consecuencias.** «Probar conexión» no ensucia el estado que ve la pantalla de IA. El endpoint se valida contra `127.0.0.1` o `localhost`: es el único campo con el que el usuario podría sacar tráfico de la máquina, y la regla del proyecto lo prohíbe.

### ADR-056 · La moneda se muestra deshabilitada, no se oculta
**Contexto.** El handoff dibuja un select de moneda, pero toda la aritmética son céntimos de euro y el formato es es-ES fijo (FASE-0 §g-9).
**Decisión.** El select se muestra con su única opción, deshabilitado y con el motivo debajo, en lugar de quitarlo o de ofrecer monedas que no funcionarían.
**Consecuencias.** La pantalla es la del diseño y no promete algo que la aplicación no hace.

### ADR-057 · Los modales de categoría e ingreso recurrente son propios
**Contexto.** El handoff solo dibuja los enlaces «+ Añadir categoría», «Editar» y «+ Añadir ingreso recurrente»; el formulario que abren no está diseñado.
**Decisión.** Reutilizan el modal de 480px de la hoja de componentes, con la muestra de color de 28px de la propia lista y la paleta cerrada del sistema. El borrado pide una segunda pulsación y dice cuántos movimientos se quedarán sin categoría.
**Consecuencias.** No se inventa anatomía nueva. Las categorías de sistema no se pueden borrar; los movimientos de una categoría borrada quedan sin categoría por la clave foránea (`ON DELETE SET NULL`).

### ADR-058 · El empaquetado queda configurado pero sin verificar
**Contexto.** Rust no está instalado en esta máquina, así que `cargo check` y `tauri build` no se pueden ejecutar.
**Decisión.** `tauri.conf.json` queda completo (productName, identifier, iconos de los tres sistemas, NSIS en español e inglés, categoría, editor y descripciones) y el perfil de release de Cargo optimiza tamaño (`lto`, `opt-level = "s"`, `strip`). El README explica qué instalar y qué produce cada sistema.
**Consecuencias.** Se declara explícitamente lo que no está probado: la compilación del binario, la ventana nativa, el diálogo de guardado, los adjuntos en disco y las tres operaciones sobre el fichero de datos, que necesitan la ventana de Tauri.

## Ajuste posterior — El mes en curso empieza vacío

### ADR-059 · Los datos de ejemplo terminan el último día del mes anterior
**Contexto.** En la aplicación real un usuario nuevo no tiene ningún movimiento: la migración solo siembra categorías y ajustes. En el modo demo, en cambio, la siembra llegaba hasta hoy y dejaba el mes en curso a medio llenar, que es lo que se ve al abrir la aplicación.
**Decisión.** `demoSeedCutoff()` (en `data/db/demo-window.ts`) devuelve el último día del mes anterior, y la siembra se detiene ahí: doce meses completos de ejemplo por detrás y el mes en curso vacío, igual que los siguientes. La ventana es relativa a la fecha de hoy, así que el demo no caduca; los dos movimientos con nombre propio del handoff («Viaje a Oporto», «Clases particulares») se anclan al último mes completo en vez de a septiembre de 2026.
**Consecuencias.** Quien abre la aplicación ve el estado vacío del mes y empieza a registrar lo suyo, con los meses anteriores llenos para que la analítica y las comparaciones tengan de dónde tirar.

### ADR-060 · Las reglas de recurrencia siguen vivas; lo que se limita es la materialización
**Contexto.** Primer intento: dar a las reglas del demo una `endDate` en el corte. Funcionaba, pero dejaba «Próximos cargos» permanentemente vacío, porque la proyección respeta la fecha de fin.
**Decisión.** Las reglas se crean activas y sin fecha de fin. Quien evita que rellenen el mes en curso es `AppStatusFacade`, que en modo demo materializa hasta el corte en lugar de hasta hoy. En la aplicación real siempre materializa hasta hoy: si alguien crea una nómina que vence el día 5, quiere verla registrada.
**Consecuencias.** El mes en curso no tiene ningún movimiento registrado y la tarjeta «Próximos cargos» sigue proyectando los siguientes 30 días, que es justo la lectura útil: la aplicación te dice lo que viene y tú decides qué registrar.

### ADR-061 · Una semana sin movimientos no se le manda al modelo
**Contexto.** El informe analiza la última semana completa, que casi siempre cae dentro del mes en curso. Con el mes vacío esa semana no tiene nada, y la pantalla respondía «No se pudo generar el informe», un error genérico. Le pasaba lo mismo a cualquier usuario nuevo de la aplicación real que pulsara «Generar análisis» sin haber registrado nada: el hueco existía desde la fase 7 y este cambio lo destapó.
**Decisión.** `AiFacade.regenerate()` comprueba `summary.movements === 0` antes de llamar a Ollama y responde con el motivo: «No hay movimientos en la semana N · …. Registra alguno y vuelve a generar el análisis.» No se guarda ningún informe fallido.
**Consecuencias.** Se evita además la peor versión del problema: pedirle a un modelo que analice una semana vacía es invitarle a inventarse cifras, justo lo que las reglas del proyecto prohíben.

### ADR-062 · `tools/ai-e2e.mjs` registra un movimiento antes de generar
**Contexto.** La prueba de extremo a extremo daba por hecho que la semana objetivo tenía datos de la siembra.
**Decisión.** El driver comprueba primero el aviso de semana vacía, luego da de alta un movimiento con fecha del lunes de esa semana desde el formulario real y entonces genera el informe. Acepta un tercer argumento con el endpoint de Ollama y lo cambia desde Ajustes, para poder ejecutarse cuando el 11434 ya está ocupado por un Ollama real.
**Consecuencias.** La prueba cubre ahora la cadena entera (alta → resumen semanal → modelo → informe) y de paso verifica que cambiar el endpoint en Ajustes llega a la pantalla de IA.

## Verificación con Ollama real y con el ejecutable

### ADR-063 · El límite del modelo es de inactividad, no de duración total
**Contexto.** Con el servidor falso todo respondía al instante y los 30 s de `AI_TIMEOUT_MS` parecían de sobra. Con Llama 3.1 8B real en esta máquina el informe tarda entre dos y tres minutos: unos 7 tokens por segundo. El `setTimeout` cortaba la petición a los 30 s aunque el modelo estuviera escribiendo, así que **ninguna** generación real terminaba.
**Decisión.** El reloj se reinicia con cada fragmento recibido. Tres valores: `AI_TIMEOUT_MS` (30 s) es el silencio admitido entre fragmentos una vez el modelo escribe; `AI_FIRST_CHUNK_MS` (3 min) es el silencio admitido antes del primer token, porque Ollama carga el modelo en memoria (11 s medidos en frío) y procesa el prompt entero antes de emitir nada; `AI_MAX_MS` (8 min) es el tope absoluto por si entra en bucle.
**Consecuencias.** Un modelo lento pero sano ya no se confunde con uno colgado, y los mensajes de error distinguen los dos casos. Verificado de extremo a extremo contra Ollama real.

### ADR-064 · Al modelo se le dan las cifras ya escritas en euros
**Contexto.** El resumen viaja en céntimos enteros (regla del proyecto). Llama 3.1 8B no convierte bien céntimos a euros dentro de una frase: escribió «has gastado 21.574 euros» donde tocaba «215,74 €», y antes «deficitaria en 4860 céntimos». Endurecer la regla del prompt no bastó.
**Decisión.** El turno del usuario incluye, después del JSON, un bloque con las mismas cifras ya formateadas en euros (totales, categorías, mayores gastos y suscripciones) y la instrucción de copiarlas tal cual. Los campos numéricos que devuelve el modelo siguen siendo céntimos.
**Consecuencias.** Un modelo pequeño copia mucho mejor de lo que calcula. Tras el cambio el veredicto salió correcto: «La semana ha sido deficitaria en un total de 215,74 €…». El coste es un prompt algo más largo.

### ADR-065 · El impacto de una recomendación se normaliza a positivo
**Contexto.** El modelo devolvía `monthly_impact_cents` con signo de gasto (negativo). El potencial de ahorro se calculaba con `Math.max(0, …)`, así que el titular decía «0,00 €/mes» mientras debajo se listaban recomendaciones con importe. Incoherencia visible en pantalla.
**Decisión.** El parser toma el valor absoluto, igual que ya hacía con el importe de los hallazgos, y el potencial de ahorro se recalcula sobre esos valores. El prompt lo dice además de forma explícita.
**Consecuencias.** El titular, el desglose de fuentes y las filas de recomendación siempre cuadran. Cubierto por un test del parser.

### ADR-066 · Empaquetado verificado en Windows
**Contexto.** Hasta ahora `tauri build` no se había podido ejecutar por falta de Rust.
**Decisión.** Se compila con Rust 1.98.1 (`stable-x86_64-pc-windows-msvc`). El aviso `unreachable pattern` de `db_tx.rs` se corrige quitando el brazo sobrante del `match`: con las features que usamos `DbPool` solo tiene la variante Sqlite, y si el plugin añadiera otra el compilador obligaría a tratarla.
**Consecuencias.** La compilación sale limpia, sin avisos. Produce `fintrack.exe` (8,6 MB), el MSI (4,8 MB) y el instalador NSIS (3,9 MB). Al arrancar el ejecutable crea `%APPDATA%\com.fintrack.app\fintrack.db` en modo WAL, con las seis tablas, esquema en la versión 2, las 10 categorías de la semilla, los 7 ajustes y **cero movimientos**.

## La app instalada, igual que en el navegador

### ADR-067 · Estilos bloqueados por la CSP de Tauri
**Contexto.** La app instalada se veía sin estilos: fondo oscuro, pero botones grises del sistema, sin barra lateral y con la tab bar de móvil a 1917 px. En el navegador no pasaba porque allí no hay CSP. Hubo dos causas. Primera: al empaquetar, Tauri añade un *nonce* a `style-src`, y en cuanto una directiva lleva *nonce* el navegador ignora `'unsafe-inline'`. Eso bloqueaba los `<style>` que Angular inyecta en tiempo de ejecución para cada componente, y sin los estilos del `Shell` el `ResizeObserver` medía 0 px y elegía el layout de móvil. Segunda: el CSS crítico en línea de Angular carga la hoja global con `media="print" onload="this.media='all'"`, y `script-src 'self'` bloquea ese manejador, así que la hoja se quedaba en `print`.
**Decisión.** `optimization.styles.inlineCritical: false` en `angular.json`, que deja un `<link rel="stylesheet">` normal sin manejadores. `dangerousDisableAssetCspModification: ["style-src"]` en `tauri.conf.json`, para que Tauri no ponga *nonce* en los estilos y `'unsafe-inline'` siga valiendo. `script-src` conserva la protección completa de Tauri.
**Consecuencias.** Se permiten estilos en línea, no scripts. En una app local sin contenido de terceros el riesgo es bajo. Verificado en la ventana real: la hoja global está activa con sus 58 reglas, los 7 bloques de estilo de componentes se aplican y no hay ninguna violación de CSP en consola.

### ADR-068 · Las peticiones a Ollama salen sin cabecera Origin
**Contexto.** En la app instalada Ollama respondía 403. `tauri-plugin-http` añade a cada petición `Origin: http://tauri.localhost`, que es el origen de la webview en Windows, y Ollama solo acepta por defecto orígenes de localhost. Medido con curl: sin Origin, 200; con `http://tauri.localhost`, 403.
**Decisión.** Se activa la feature `unsafe-headers` del plugin y el cliente envía `Origin` vacío, que el plugin interpreta como «quítala». Es una petición de servidor a servidor desde Rust: no necesita Origin.
**Consecuencias.** Funciona con cualquier instalación de Ollama sin tocar `OLLAMA_ORIGINS`. Verificado en la ventana real: «Conectado · 11 ms» y `llama3.1:8b` en la lista de modelos.

### ADR-069 · Inspección del ejecutable real por CDP
**Contexto.** Los dos fallos anteriores solo aparecían en la ventana de Tauri, y todas las pruebas de extremo a extremo corrían en Chrome. Tauri pasa sus propios argumentos a WebView2, así que la variable `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` se ignora.
**Decisión.** `src-tauri/tauri.inspect.conf.json` abre el puerto de depuración con `additionalBrowserArgs` y usa un identificador propio (`com.fintrack.app.inspect`). Así no comparte proceso de WebView2 ni base de datos con la app instalada si está abierta. `tools/tauri-inspect.mjs` se conecta a la ventana real, recoge las violaciones de CSP, el estado de las hojas de estilo y la conexión con Ollama, y captura cada pantalla. Esa configuración nunca se distribuye.
**Consecuencias.** La app empaquetada deja de ser una caja negra.

## Segunda ronda de cambios pedidos por el usuario

### ADR-070 · Presupuestos por ámbito en lugar de un presupuesto único
**Contexto.** Ajustes tenía un «Presupuesto mensual objetivo» único (1.750 € por defecto, el valor de ejemplo del handoff). El usuario quiere elegir qué vigilar (ahorro, inversión, ocio…) y que la analítica diga hasta dónde ha llegado en cada cosa.
**Decisión.** Tabla `budgets` (migración 0003): un presupuesto mensual por ámbito, con `scope` único. Hay siete ámbitos base que reutilizan las agrupaciones que ya pinta la app (gasto total, fijos, variables, ocio, suscripciones, ahorro, inversión) y, además, cualquier categoría de gasto. Ahorro e inversión son **objetivos** (conviene llegar); el resto son **límites** (conviene no pasarse). La 0003 convierte el presupuesto antiguo en «Gasto total» solo si el usuario lo había cambiado; el 1.750 € sembrado a todo el mundo no se convierte, porque sería inventarse un dato.
**Consecuencias.** Una instalación nueva no tiene ningún presupuesto. El límite de «Gasto total», si existe, sustituye al presupuesto único donde se usaba: aviso de proyección del KPI de gastos, objetivo de tasa de ahorro y resumen de la IA.

### ADR-071 · Tarjeta «Presupuestos» en Analítica
**Decisión.** `evaluateBudgets()` (puro, en céntimos) compara cada presupuesto con lo movido en el rango elegido. El importe mensual se multiplica por los meses de calendario del rango. Usa todos los movimientos del rango, sin los filtros de categoría y tipo: un presupuesto no debe cambiar porque se esté mirando solo una parte de los datos. La barra reutiliza la anatomía de «Presupuesto consumido» del dashboard. El color dice el estado: acento si un límite va bien, ámbar desde el 80 %, rojo si se ha pasado; azul para un objetivo en curso y verde cuando se cumple.
**Consecuencias.** Sin presupuestos, la tarjeta remite a Ajustes. Cubierto por 5 tests del cálculo, 3 del repositorio y 1 de la migración.

### ADR-072 · Moneda de visualización: euro o dólar
**Decisión.** La moneda activa es una signal dentro de `money-format`. `formatMoney` la lee, así que toda plantilla o `computed` que formatee dinero se repinta al cambiarla, sin recargar. No hay conversión: los importes se guardan en céntimos y solo cambia el símbolo; el formato numérico sigue siendo es-ES. Se retiraron los 19 `€` escritos a mano (calculadora, donut, campo de importe, ejemplo de notas, PDF, Word, formato de celda de Excel y prompt de la IA).
**Consecuencias.** El selector de Ajustes explica que los importes no se convierten.

### ADR-073 · Ningún dato de ejemplo en ningún modo
**Contexto.** La demo del navegador sembraba doce meses de movimientos ficticios, y la analítica los mostraba como si fueran reales.
**Decisión.** Se eliminan la siembra y su frontera temporal. La app arranca vacía en el navegador y en el ejecutable. Las pruebas de extremo a extremo registran sus propios movimientos desde el formulario real.
**Consecuencias.** La base de datos real del usuario ya estaba limpia; lo que se veía era la demo.

### ADR-074 · El texto del botón primario desaparecía al pasar el ratón
**Contexto.** «Nuevo evento» es un `<a class="ft-btn ft-btn--primary">`. La regla global `a:hover` (especificidad 0,1,1) ganaba al color del botón (0,1,0) y pintaba el texto con `accent-hover`, el mismo color que su fondo al pasar el ratón.
**Decisión.** El cambio de color al pasar el ratón se limita a `a:not(.ft-btn)`.

### ADR-075 · WebView2 en español
**Contexto.** Los textos nativos del navegador (el aviso del icono de calendario de `<input type="date">`, entre otros) salían en inglés. No venían de la app, que ya declaraba `lang="es"`, sino del idioma de la interfaz de WebView2.
**Decisión.** `--lang=es-ES` en `additionalBrowserArgs`, junto a los argumentos por defecto de wry, que hay que repetir al definir los propios.
**Consecuencias.** Los controles nativos hablan español y el campo de fecha muestra el orden día/mes/año.

### ADR-076 · Casilla «La tengo en cuenta» en lugar de «Aplicar»
**Contexto.** El botón «Aplicar» del handoff solo guardaba una marca; no ejecutaba nada. Prometía una acción que no existe.
**Decisión.** Una casilla accesible con el mismo efecto. El potencial de ahorro sigue sumando las recomendaciones sin marcar y menciona aparte las que ya tienes en cuenta.

### ADR-077 · Iconos a partir de `design/icon.png`
**Contexto.** Los ficheros de `design` tienen el contenido cruzado con el nombre: `favicon.ico` es un PNG, `icon-256.png` es un ICO, `icon-128.png` es un logotipo apaisado de 596×132, `mark-mono.svg` y `mark-currentcolor.svg` son PNG, y `README.md` y `logo.component.ts` contienen SVG.
**Decisión.** Solo se usan los ficheros cuyo contenido se ha comprobado. `icon.png` (1024×1024) genera con `tauri icon` el `.ico`, el `.icns` y los PNG del ejecutable, el MSI, el instalador NSIS y la ventana. El ICO real (el que se llama `icon-256.png`) pasa a `public/favicon.ico`, y `favicon.svg` es el favicon principal. En la barra lateral, la marca de `mark.svg` va en línea sustituyendo al cuadrado liso.
**Consecuencias.** Se borran los iconos de Android e iOS que genera `tauri icon`: la app es de escritorio.

### ADR-078 · Informe de IA más rápido, medido en lugar de supuesto
**Contexto.** Con `llama3.1:8b` en CPU el informe tardaba 156 s: 10,7 s de carga del modelo, 45,4 s de lectura del prompt (1.104 tokens) y 99,3 s de generación (544 tokens). Medido con `scripts/ai-bench.spec.ts` contra Ollama real, que usa exactamente las opciones de la app (`AI_REQUEST_OPTIONS`).
**Decisión.** Primero, se precarga el modelo en cuanto se detecta Ollama (`warmUp`) y queda 30 minutos en memoria. Segundo, `num_ctx` baja a 4096, que cubre prompt y respuesta. Tercero, se acotan la longitud y el número de elementos en el esquema del informe: Ollama lo aplica como gramática, así que el modelo no puede escribir más. Además el prompt pide una frase por detalle. Cuarto, `num_predict` queda en 700 solo como red de seguridad: con 450 la respuesta llegaba justo al tope y el JSON salía cortado, cosa que también se midió.
**Consecuencias.** Con el 8B, 106 s (22 s de prompt y 84 s de generación), con JSON válido y fin natural. Con `llama3.2:3b`, 71 s. La generación queda limitada por la CPU, a unos 6 tokens/s con el 8B: el siguiente salto solo lo da un modelo más pequeño o una GPU. El modelo por defecto no se cambia; se elige en Ajustes. La medición usa importes aleatorios porque Ollama cachea un prompt idéntico y falsearía la lectura.

### ADR-079 · Gráficos de Analítica con scroll horizontal y ventana de periodos
**Contexto.** «Ingresos · Gastos · Inversión» y «Saldo acumulado» metían todos los periodos del rango en el ancho de la tarjeta. Con Día y medio año salían 183 barras y las etiquetas se pisaban hasta ser ilegibles.
**Decisión.** Cada granularidad tiene un número de periodos a la vista (`VISIBLE_PERIODS`): 7 días, 6 semanas, 6 meses o 5 años. Si el rango trae más, el gráfico se ensancha en proporción dentro de un contenedor con scroll horizontal. En las barras el ancho es `n / visibles`; en la línea, que va de borde a borde, `(n − 1) / (visibles − 1)`. Es un porcentaje en CSS: no hace falta medir la tarjeta, y el ResizeObserver de la directiva `[chart]` redimensiona ECharts. La directiva `[scrollEnd]` lleva el scroll a lo más reciente al abrir y cada vez que cambian la granularidad o el rango; si solo cambian los datos, respeta dónde lo dejó el usuario. El tooltip se cuelga de `<body>` para que el contenedor no lo recorte. La altura va en el gráfico y no en el contenedor, así que la barra de scroll se añade debajo y no encoge el gráfico, que si no dispararía el ResizeObserver dos veces en el mismo frame. En móvil el comparativo conserva los 92px por periodo del handoff.
**Consecuencias.** Al exportar a PDF o Word, el gráfico se dibuja un momento con el ancho visible y el rango entero, para que no salga una tira de decenas de miles de píxeles; después vuelve a su tamaño. Las etiquetas del eje usan `interval: 'auto'`: en pantalla se ven todas porque cada periodo tiene su franja, y en la exportación no se amontonan. Verificado con `tools/charts-e2e.mjs`.

### ADR-080 · Modelos de Ollama: los Llama más recientes no caben en este equipo
**Contexto.** Se pidió instalar el último Llama gratuito. En Ollama, en septiembre de 2026, los más recientes son Llama 4 Scout (`llama4:scout`, 67 GB; Maverick, 245 GB) y Llama 3.3 (solo 70B, de 26 a 43 GB). El modelo abierto más nuevo de Meta, Muse Glimmer 30B (`muse-glimmer`, agosto de 2026), ocupa 17–18 GB en 4 bits. Este equipo tiene 15,3 GB de RAM y ninguna GPU dedicada. Un modelo solo funciona si cabe entero en memoria; si no, Ollama o no lo carga o pagina a disco y tarda muchos minutos por informe.
**Decisión.** No se descarga ninguno. Siguen `llama3.1:8b` (por defecto) y `llama3.2:3b`, que son los Llama más recientes que caben aquí; Meta no ha sacado versiones pequeñas de Llama 4 ni de 3.3. La app no necesita cambios para usar otro modelo: Ajustes → Ollama lista lo que Ollama tenga instalado.
**Consecuencias.** En un equipo con 24 GB o más, o con GPU, basta con `ollama pull muse-glimmer` o `ollama pull llama4:scout` y elegirlo en Ajustes. El esquema JSON y el prompt no dependen del modelo.
