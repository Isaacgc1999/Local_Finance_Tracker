# Fintrack — Fase 0: lectura del handoff, inventario y plan

Estado: **pendiente de visto bueno**. No se ha escrito código de producción.

---

## a) Inventario del handoff

Carpeta: `public/design_handoff_fintrack/` (4 ficheros, 279 KB). Los cuatro existen y están íntegros (el runtime `support.js` abre y cierra correctamente; ninguna referencia rota).

| Fichero | Tamaño | Qué cubre |
|---|---|---|
| `README.md` | 191 líneas | Índice. Tokens de color (9 base + 4 semánticos + convenciones de alpha, foco, fila activa, rampa de rojos, deshabilitado), tipografía (Inter, 5 roles), forma y espacio (radios, rejilla 8, alturas de control), layout responsive (≥1024 / 768 / ≤640), descripción de las 6 pantallas con datos de ejemplo, tabla de 9 componentes con sus 6 estados, interacciones, modelo de estado del prototipo, assets (sin imágenes, iconos SVG 18px trazo 1.6). |
| `Fintrack.dc.html` | 1.847 líneas | Prototipo completo. Sección 0 "Fundamentos" (swatches, escala tipográfica, formas). Pantallas 1–6 en 1440 / 768 / 390. Sección 7 "Componentes" con estados. Datos de ejemplo en `Component.renderVals()` (líneas 1697–1843): KPI con puntos de sparkline, semanas con alturas de segmentos, donut, próximos cargos, movimientos, filas de categorías, meses, hallazgos, recomendaciones, estados de fila/KPI/chip/input, teclas de calculadora, historial, categorías de ajustes con color. |
| `Sidebar.dc.html` | 78 líneas | Sidebar 240px (con etiquetas + tarjeta "Datos locales · fintrack.db · 2,4 MB") y 64px (`collapsed`). 5 destinos: dashboard, movimientos, analitica, ia, ajustes. Los 5 iconos SVG con sus paths exactos. Ítem activo `#1B1E24` / `#F2F4F7`, inactivo transparente / `#9BA3AF`, padding `10px 12px`, r8, gap 2px. |
| `support.js` | 1.911 líneas | Runtime del prototipo (carga React UMD, parsea `{{ }}`, `<sc-for>`, `<sc-if>`, `<dc-import>`). **No se porta.** Solo se ha leído para entender cómo interpretar las plantillas. |

### Frames que SÍ están en el prototipo

| Pantalla | 1440 | 768 | 390 | Extras |
|---|---|---|---|---|
| 1 Dashboard | ✔ | ✔ | ✔ (scroll horizontal en semanas, FAB, tab bar) | — |
| 2 Nuevo evento | ✔ tipo Gasto | ✔ tipo Inversión | ✔ hoja completa (Gasto) | — |
| 3 Analítica | ✔ con menú Exportar abierto | ✔ (tabla 5 col.) | ✔ (tarjetas apiladas) | Modal "Exportar a Excel" 480px |
| 4 Análisis IA | ✔ (timeline con expandida, 2 colapsadas, 1 generando) | ✔ estado "No detectado" | ✔ | — |
| 5 Calculadora | ✔ panel 400px sobre dashboard atenuado | ✔ pestaña Financiera (solo el panel de 400px) | ✔ hoja modal con asa | — |
| 6 Ajustes | ✔ | ✔ | ✔ (sin ingresos recurrentes ni moneda) | — |
| 7 Componentes | Fila de movimiento (6 estados), Tarjeta KPI (6), Chip de categoría (6), Segmented (4), Input de importe (5), Badge de tipo (6 variantes), Skeleton, Tarjeta IA (3 estados), Estado vacío (2 variantes) | | | |

### Lo que NO cubre el handoff (lo resolveré yo, marcado como propuesta propia en la implementación)

1. **`/events` — listado completo y edición.** Solo existen "Movimientos recientes" (6 filas) y los estados de la fila. No hay pantalla de lista con filtros, ni modo edición, ni borrado. Propuesta: lista a página completa con la misma barra de filtros de Analítica (rango + categorías + tipos + buscador de concepto), filas `Fila de movimiento` agrupadas por día, y edición reutilizando el formulario de `/events/new` en ruta `/events/:id` con acción "Eliminar" (confirmación en modal).
2. **Formulario para Ingreso, Suscripción, Domiciliación y Ahorro.** Solo están Gasto e Inversión. Propuesta de campos por tipo en §c (estrategias).
3. **Estado "modelo no descargado"** (exigido por tus reglas). El handoff solo tiene Conectado / No detectado / generando / error. Reutilizaré la tarjeta de error con borde `expense` y copy propio con el comando `ollama pull <modelo>`.
4. **Estados abiertos de selects, date picker y multiselección** (Método de pago, Plataforma, Modelo, Moneda, rango de fechas, Categorías/Tipos). Solo se ve el control cerrado. Usaré `<select>` nativo estilizado, `<input type="date">` nativo y un popover propio con chips para las multiselecciones, con los tokens del handoff.
5. **Diálogos de Ajustes**: editar/añadir categoría, añadir ingreso recurrente, confirmar restauración, "Cambiar" ruta del fichero, confirmación de borrado. Usaré el modal de 480px del handoff como base.
6. **Calculadora**: los modos "% de importe" y "Dividir" solo aparecen como chips; solo está diseñado "Interés compuesto". Seguiré la misma rejilla 2×N de inputs + caja de resultado.
7. **Analítica en granularidad Día / Semana / Año**: solo hay frame de Mes. Los mismos gráficos con el eje X según granularidad.
8. **Feedback de éxito** (guardado, copia creada, exportación escrita). No hay toasts. Propuesta: pill de estado discreta (misma anatomía que "Conectado") anclada abajo a la izquierda, sin animación, que desaparece a los 4 s.
9. **Skeleton de tarjeta y de gráfico**: solo está el de fila. Derivaré bloques con el mismo barrido.
10. **Arranque**: no hay pantalla de carga inicial ni de error al abrir la BD/migraciones. Usaré skeletons a pantalla completa y la tarjeta de error del handoff.
11. **Ajustes 390** omite Ingresos recurrentes y Moneda: las apilaré debajo con el mismo patrón.
12. **Adjuntar recibo**: no hay flujo de selección ni visor. Diálogo nativo de Tauri, copia del fichero a `appData/attachments/`, y la fila de adjunto del handoff con ✕.
13. **Ventana**: sin barra de título propia → decoraciones nativas del SO.
14. **Solo tema oscuro.** No se implementa tema claro.
15. **Atajos de teclado** (Ctrl/Cmd+K, Ctrl/Cmd+Enter): sin pista visual. Añadiré `title`/`aria-keyshortcuts`, sin cambiar el diseño.

---

## b) Tokens extraídos → custom properties SCSS

Todos los valores salen del README o del markup inline del prototipo. Prefijo `--ft-`. Se declaran en `src/styles/_tokens.scss` sobre `:root`.

### Color base
| Token handoff | Hex | Custom property |
|---|---|---|
| bg | `#0A0B0D` | `--ft-bg` |
| surface | `#131519` | `--ft-surface` |
| surface-elevated | `#1B1E24` | `--ft-surface-elevated` |
| border | `#262A31` | `--ft-border` |
| border-subtle | `#1B1E24` | `--ft-border-subtle` |
| (hover de KPI/chip) | `#2F343D` | `--ft-border-hover` |
| text-1 | `#F2F4F7` | `--ft-text-1` |
| text-2 | `#9BA3AF` | `--ft-text-2` |
| text-3 | `#6B7280` | `--ft-text-3` |
| (segmento deshabilitado) | `#4B5563` | `--ft-text-disabled` |
| accent | `#6E56F8` | `--ft-accent` |
| (hover de enlace, CSS del prototipo) | `#8B78FA` | `--ft-accent-hover` |
| (texto sobre acento) | `#FFFFFF` | `--ft-on-accent` |

### Color semántico (sistema cerrado)
| Token | Hex | Custom property | Derivadas (alpha) |
|---|---|---|---|
| income | `#22C55E` | `--ft-income` | `--ft-income-12: #22C55E1F` |
| expense | `#F45B5B` | `--ft-expense` | `--ft-expense-12: #F45B5B1F`, `--ft-expense-8: #F45B5B14` |
| investment | `#38BDF8` | `--ft-investment` | `--ft-investment-12: #38BDF81F`, `--ft-on-investment: #0A0B0D` |
| savings | `#FBBF24` | `--ft-savings` | `--ft-savings-12: #FBBF241F` |
| accent (badge Suscripción, operadores) | `#6E56F8` | — | `--ft-accent-12: #6E56F81F`, `--ft-accent-8: #6E56F814`, `--ft-accent-ring: #6E56F833` |
| rampa de gasto | `#F45B5B` `#C24B4B` `#8F3A3A` `#5C2A2A` | `--ft-expense-ramp-1..4` | — |

Convenciones: `--ft-focus-ring: 0 0 0 3px #6E56F833`; `--ft-skeleton-gradient: linear-gradient(90deg,#1B1E24 25%,#262A31 50%,#1B1E24 75%)`; `--ft-opacity-disabled: .4` (filas, KPI) y `--ft-opacity-disabled-control: .45` (chips, inputs); `--ft-opacity-dimmed: .45` (contenido tras la calculadora).

### Tipografía
| Rol | Valor | Custom property |
|---|---|---|
| familia | `Inter, system-ui, sans-serif` (400/500/600/700, autoalojada) | `--ft-font-family` |
| display | `700 40px/1.1`, `letter-spacing:-0.02em` | `--ft-font-display`, `--ft-tracking-display` |
| título / KPI / veredicto | `600 24px/1` (`/1.3` en frase larga) | `--ft-font-title`, `--ft-lh-title-long: 1.3` |
| etiqueta / fila / botón | `500 15px/1` (`/1.3`–`/1.4` en filas) | `--ft-font-label` |
| cuerpo | `400 15px/1.5`–`/1.6` | `--ft-font-body` |
| metadato / leyenda | `400 13px/1` (`/1.4`–`/1.6` en párrafos) | `--ft-font-meta` |
| eyebrow | `500 13px`, `letter-spacing:.08em`, mayúsculas | `--ft-font-eyebrow`, `--ft-tracking-eyebrow` |
| tecla de calculadora | `500 24px/1` | `--ft-font-key` |
| logo | `700 16px/1`, `-0.01em` | `--ft-font-logo` |
| cifras | `font-variant-numeric: tabular-nums; letter-spacing:-0.01em` | mixin `ft-num` + clase `.num` |

### Forma
| Uso | Valor | Custom property |
|---|---|---|
| tarjetas, paneles, modales, menú | 12px | `--ft-radius-card` |
| inputs, botones, teclas, filas internas | 8px | `--ft-radius-control` |
| segmento activo | 6px | `--ft-radius-segment` |
| conjunto de barra apilada | 6px | `--ft-radius-stack` |
| tope de barra de gráfico | 4px | `--ft-radius-bar` |
| cuadrado de leyenda | 2px | `--ft-radius-legend` |
| chips, badges, pills, avatar | 999px | `--ft-radius-pill` |
| borde | 1px sólido, sin sombras | `--ft-border-width` |

### Espacio (rejilla 8)
| Uso | Escritorio | 768 | ≤640 | Custom property |
|---|---|---|---|---|
| padding de página | `28px 32px 32px` | `24px` | `20px 16px` | `--ft-page-padding` (redefinida por breakpoint) |
| padding de tarjeta | 24px (20px en KPI) | 20px | 16px | `--ft-card-padding` |
| separación entre secciones | 32px | 24px | 20px | `--ft-section-gap` |
| gap de rejilla | 20px | 16px | 12px | `--ft-grid-gap` |
| escala | 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 | | | `--ft-space-1..8` |

### Tamaños de control y layout
| Elemento | Valor | Custom property |
|---|---|---|
| input | 44px (48px móvil) | `--ft-control-h`, `--ft-control-h-mobile` |
| botón | 40px (36px compacto, 48px móvil apilado) | `--ft-button-h`, `--ft-button-h-compact`, `--ft-button-h-mobile` |
| filtro | 38px (34px en 768, 32px en 390) | `--ft-filter-h`, `--ft-filter-h-tablet`, `--ft-filter-h-mobile` |
| chip | 32px (36px móvil) | `--ft-chip-h`, `--ft-chip-h-mobile` |
| badge de tipo | 26px | `--ft-badge-h` |
| pill de estado | 24px | `--ft-status-pill-h` |
| input de importe | 72px (80px móvil; 56px presupuesto en Ajustes) | `--ft-amount-h`, `--ft-amount-h-mobile`, `--ft-amount-h-compact` |
| textarea | 84px | `--ft-textarea-h` |
| botón icono | 32px (28px móvil) | `--ft-icon-button` |
| icono | 18px, trazo 1.6, extremos redondos | `--ft-icon-size`, `--ft-icon-stroke` |
| toggle | 44×26, pastilla 20, padding 3 | `--ft-toggle-w/h/knob/pad` |
| tecla | 56px (60px móvil), gap 8 | `--ft-key-h`, `--ft-key-h-mobile` |
| avatar de fila | 32px | `--ft-avatar` |
| muestra de color | 28px | `--ft-swatch` |
| punto semántico | 6px | `--ft-dot` |
| cuadrado de leyenda | 8px | `--ft-legend-sq` |
| barra de presupuesto | 10px; marca 2px que sobresale 5px | `--ft-progress-h`, `--ft-day-mark-w` |
| barra de progreso IA | 6px | `--ft-progress-thin` |
| mini barra de proporción | 4px, máx 220px (150px en 768) | `--ft-minibar-h`, `--ft-minibar-max` |
| timeline | línea 2px, nodo 12px, anillo 3px | `--ft-timeline-line`, `--ft-timeline-node` |
| donut | 148px, agujero 96px | `--ft-donut`, `--ft-donut-hole` |
| barra semanal | máx 72 / 56 / 48px; columna móvil 64px; alto 215px | `--ft-week-bar-max`, `--ft-week-col-mobile`, `--ft-week-chart-h` |
| barras comparativa | 22px (16px móvil/tablet), gap 4; alto 190px | `--ft-compare-bar-w`, `--ft-compare-chart-h` |
| gráfico de líneas | 165px (120px móvil), 2.5px saldo, 2px media `6 5` | `--ft-line-chart-h`, `--ft-line-w`, `--ft-ma-w` |
| sparkline | 100×28 (72×28 en 768, ancho completo en 390) | `--ft-sparkline-w/h` |
| sidebar | 240px / 64px | `--ft-sidebar-w`, `--ft-sidebar-collapsed-w` |
| tab bar | 76px | `--ft-tabbar-h` |
| FAB | 56px, `+` 28px, 16px derecha, 96px abajo; padding inferior de lista 152px | `--ft-fab-size`, `--ft-fab-right`, `--ft-fab-bottom`, `--ft-list-pad-mobile` |
| panel calculadora | 400px | `--ft-calc-panel-w` |
| menú exportar | 212px, padding 6px | `--ft-menu-w` |
| modal | 480px | `--ft-modal-w` |
| tooltip | 196px | `--ft-tooltip-w` |
| asa de hoja | 40×4 | `--ft-sheet-handle` |
| objetivo táctil | 44×44 | `--ft-touch-min` |

### Breakpoints (mapa SCSS `$ft-breakpoints`, no custom property: las media queries no admiten `var()`)
| Nombre | Rango |
|---|---|
| `mobile` | ≤ 640px |
| `tablet` | 641px – 1023px |
| `desktop` | ≥ 1024px |

### Movimiento (solo dos)
`--ft-anim-shim: shim 1.6s linear infinite` · `--ft-anim-pulse: pulse 1.4s ease-in-out infinite` (opacidad .35→1). Ningún `transition`.

### Z-index (propios, el handoff solo fija `z-index:5` del menú)
`--ft-z-sticky: 3`, `--ft-z-menu: 5`, `--ft-z-fab: 6`, `--ft-z-panel: 10`, `--ft-z-modal: 20`, `--ft-z-toast: 30`.

---

## c) Mapa handoff → componentes Angular

Convenciones: prefijo de selector `ft-`, nombres de clase sin sufijo `Component` (guía de estilo Angular 20+, como el scaffold), **nombre del handoff conservado en español** (p. ej. `FilaMovimiento`). Cada componente: `nombre.ts` + `nombre.html` + `nombre.scss`.

### Layout
| Handoff | Componente | Ruta | Aparece en |
|---|---|---|---|
| Sidebar (`Sidebar.dc.html`) | `Sidebar` `<ft-sidebar [collapsed]>` | `src/app/layout/sidebar/` | todas (≥641px) |
| Tab bar inferior | `TabBar` | `src/app/layout/tab-bar/` | todas (≤640px) |
| FAB "+" | `Fab` | `src/app/layout/fab/` | dashboard, events, analytics, ai, settings (≤640px) |
| (contenedor) | `Shell` | `src/app/layout/shell/` | raíz: sidebar + `<router-outlet>` + tab bar + host de calculadora + toasts |
| Cabecera de pantalla (título + acciones) *(propio)* | `CabeceraPagina` | `src/app/layout/cabecera-pagina/` | todas |
| Pill de estado (Conectado / No detectado / latencia) | `PillEstado` | `src/app/shared/components/pill-estado/` | ai, settings, toasts |

### Hoja de componentes (sección 7)
| Handoff | Componente | Ruta | Aparece en |
|---|---|---|---|
| Fila de movimiento | `FilaMovimiento` (estados: normal/hover/activo/foco/deshabilitada/error via inputs + `:hover`/`:focus-visible`) | `shared/components/fila-movimiento/` | dashboard, events |
| Tarjeta KPI con sparkline | `TarjetaKpi` (sparkline opcional; estados) | `shared/components/tarjeta-kpi/` | dashboard (4), analytics (fila de métricas, sin sparkline) |
| Chip de categoría | `ChipCategoria` | `shared/components/chip-categoria/` | events/new, analytics (popover), settings |
| Segmented control | `SegmentedControl` (genérico, `options`, `value`, `disabled[]`, variantes `grid-3x2` y `chips-scroll` por breakpoint) | `shared/components/segmented-control/` | events/new (tipo, naturaleza, frecuencia), analytics (granularidad), calculator (pestañas), settings (formato fecha) |
| Input de importe | `InputImporte` (`ControlValueAccessor` sobre `Money`) | `shared/components/input-importe/` | events/new, settings (presupuesto), calculator (financiera) |
| Badge de tipo | `BadgeTipo` | `shared/components/badge-tipo/` | events (lista), events/:id |
| Tarjeta de informe IA | `TarjetaInformeIa` (expandida / colapsada / cargando / error) | `features/ai/tarjeta-informe-ia/` | ai |
| Estado vacío ilustrado | `EstadoVacio` (`variant: 'sin-datos' \| 'sin-resultados'`) | `shared/components/estado-vacio/` | dashboard, events, analytics, ai |
| Skeleton de carga | `Skeleton` (`variant: 'fila' \| 'tarjeta' \| 'grafico'`) | `shared/components/skeleton/` | todas |
| Toggle | `Toggle` (`ControlValueAccessor`) | `shared/components/toggle/` | events/new, analytics (modal), settings |
| Pill de filtro con contador | `PillFiltro` | `shared/components/pill-filtro/` | analytics, events |
| Menú desplegable (Exportar) | `MenuDesplegable` | `shared/components/menu-desplegable/` | analytics |
| Modal 480px | `Modal` | `shared/components/modal/` | analytics (exportar), settings (confirmaciones, categoría, ingreso recurrente), events (borrar) |
| Panel lateral / hoja modal | `PanelLateral` | `shared/components/panel-lateral/` | calculator |
| Spinner pulsante | `Spinner` | `shared/components/spinner/` | ai |
| Botones primario/secundario/icono, inputs, select, textarea | **estilos globales** `.ft-btn`, `.ft-input`, `.ft-select`, `.ft-textarea` (sin componente: elementos nativos) | `src/styles/_controls.scss` | todas |
| Iconos de navegación (5 SVG) | `Icono` (`name`) | `shared/components/icono/` | sidebar, tab bar |
| Gráficos ECharts | directiva `[chart]` | `shared/directives/chart.directive.ts` | dashboard, analytics, export |

### 1 · Dashboard (`/dashboard`)
| Handoff | Componente | Ruta |
|---|---|---|
| Pantalla | `Dashboard` | `features/dashboard/dashboard.ts` |
| Cabecera ‹ Septiembre 2026 › + pill "Hoy · 9 sep" | `SelectorMes` | `features/dashboard/selector-mes/` |
| Hero "Balance del mes" | `HeroBalance` | `features/dashboard/hero-balance/` |
| 4 KPI | `TarjetaKpi` ×4 | shared |
| Barra "Presupuesto consumido" | `BarraPresupuesto` | `features/dashboard/barra-presupuesto/` |
| Gasto por semana (barras apiladas) | `GastoPorSemana` (ECharts) | `features/dashboard/gasto-por-semana/` |
| Desglose por tipo de gasto (donut) | `DesgloseTipoGasto` (ECharts donut + lista) | `features/dashboard/desglose-tipo-gasto/` |
| Próximos cargos | `ProximosCargos` | `features/dashboard/proximos-cargos/` |
| Movimientos recientes | `MovimientosRecientes` (usa `FilaMovimiento`) | `features/dashboard/movimientos-recientes/` |

### 2 · Nuevo evento (`/events/new`, `/events/:id`)
| Handoff | Componente | Ruta |
|---|---|---|
| Pantalla / hoja | `EventForm` (contenedor) | `features/events/event-form/event-form.ts` |
| Selector de tipo (segmented 6 / grid 3×2 / chips scroll) | `SelectorTipo` (envuelve `SegmentedControl`) | `features/events/event-form/selector-tipo/` |
| Campos por tipo (estrategia) | `CamposGasto`, `CamposIngreso`, `CamposSuscripcion`, `CamposDomiciliacion`, `CamposAhorro`, `CamposInversion` | `features/events/event-form/campos/` |
| Bloque Recurrente / Aportación periódica + Frecuencia + Fecha de fin | `BloqueRecurrencia` | `features/events/event-form/bloque-recurrencia/` |
| Adjuntar recibo | `AdjuntarRecibo` | `features/events/event-form/adjuntar-recibo/` |
| Barra inferior fija (Guardar y añadir otro / Cancelar / Guardar) | `BarraAcciones` | `features/events/event-form/barra-acciones/` |

Campos por tipo (los de Gasto e Inversión salen del handoff; el resto es propuesta):
- **Gasto**: importe, fecha, categoría (chips, obligatoria), naturaleza (fijo/variable), método de pago, concepto, notas, recurrente, adjunto.
- **Ingreso**: importe (borde `income`), fecha, concepto, origen (select: Nómina / Transferencia / Efectivo / Otro → `meta.source`), categoría (kind income, opcional), notas, recurrente.
- **Suscripción**: importe (borde acento), fecha del próximo cargo, concepto/servicio, categoría (opcional), método de pago, frecuencia (siempre visible: mensual/anual), fecha de fin, notas.
- **Domiciliación**: importe, fecha, concepto, entidad emisora (`meta.issuer`), categoría (opcional), frecuencia (siempre visible), fecha de fin, notas.
- **Ahorro**: importe (borde `savings`), fecha, concepto, cuenta/destino (`meta.account`), objetivo (`meta.goal`, opcional), aportación periódica.
- **Inversión**: importe aportado (borde `investment`), fecha, activo/ticker (obligatorio), plataforma, tipo de activo (chips), aportación periódica.

### `/events` (listado — sin diseño, propuesta)
| Componente | Ruta |
|---|---|
| `EventList` (barra de filtros reutilizada + grupos por día + `FilaMovimiento` + `BadgeTipo` + `EstadoVacio` + skeleton) | `features/events/event-list/` |

### 3 · Analítica (`/analytics`)
| Handoff | Componente | Ruta |
|---|---|---|
| Pantalla | `Analytics` | `features/analytics/analytics.ts` |
| Barra de filtros pegajosa | `BarraFiltros` | `features/analytics/barra-filtros/` |
| Popover de multiselección Categorías / Tipos *(propio)* | `PopoverMultiseleccion` | `shared/components/popover-multiseleccion/` |
| Fila de métricas (5 tarjetas) | `FilaMetricas` (usa `TarjetaKpi`) | `features/analytics/fila-metricas/` |
| Gráfico comparativo (barras agrupadas + tooltip) | `GraficoComparativo` (ECharts) | `features/analytics/grafico-comparativo/` |
| Gráfico de líneas (saldo + media móvil) | `GraficoSaldo` (ECharts) | `features/analytics/grafico-saldo/` |
| Tabla de desglose por categoría (7 / 5 col. / tarjetas) | `TablaCategorias` + `TarjetaCategoria` (móvil) | `features/analytics/tabla-categorias/` |
| Botón + menú "Exportar ▾" | `MenuExportar` (usa `MenuDesplegable`) | `features/analytics/menu-exportar/` |
| Modal de opciones de exportación | `ModalExportar` (usa `Modal`, `Toggle`) | `features/analytics/modal-exportar/` |

### 4 · Análisis IA (`/ai`)
| Handoff | Componente | Ruta |
|---|---|---|
| Pantalla | `Ai` | `features/ai/ai.ts` |
| Cabecera (título + badge modelo + pill estado + párrafo + botones) | `CabeceraIa` | `features/ai/cabecera-ia/` |
| Timeline vertical | `TimelineInformes` | `features/ai/timeline-informes/` |
| Tarjeta expandida / colapsada / generando / error | `TarjetaInformeIa` | `features/ai/tarjeta-informe-ia/` |
| Tarjeta "No se encuentra Ollama…" + Reintentar | `TarjetaErrorOllama` (también para "modelo no descargado") | `features/ai/tarjeta-error-ollama/` |
| Potencial de ahorro detectado | `PotencialAhorro` | `features/ai/potencial-ahorro/` |
| Estado del modelo | `EstadoModelo` | `features/ai/estado-modelo/` |

### 5 · Calculadora (Ctrl/Cmd+K, sin ruta)
| Handoff | Componente | Ruta |
|---|---|---|
| Panel / hoja | `Calculadora` (dentro de `PanelLateral`, montada en `Shell`) | `features/calculator/calculadora.ts` |
| Display | `DisplayCalc` | `features/calculator/display-calc/` |
| Teclado 4 columnas | `TecladoCalc` | `features/calculator/teclado-calc/` |
| Pestaña Financiera (chips de modo + inputs + resultado) | `PestanaFinanciera` | `features/calculator/pestana-financiera/` |
| Historial | `HistorialCalc` | `features/calculator/historial-calc/` |
| "Usar X en nuevo evento" | acción de `Calculadora` → navega a `/events/new?amount=<céntimos>` | — |

### 6 · Ajustes (`/settings`)
| Handoff | Componente | Ruta |
|---|---|---|
| Pantalla (7/5 → 1 col.) | `Settings` | `features/settings/settings.ts` |
| Fichero de datos | `FicheroDatos` | `features/settings/fichero-datos/` |
| Ollama | `AjustesOllama` | `features/settings/ajustes-ollama/` |
| Categorías (lista editable) | `ListaCategorias` + `ModalCategoria` *(propio)* | `features/settings/lista-categorias/` |
| Ingresos recurrentes | `IngresosRecurrentes` + `ModalIngresoRecurrente` *(propio)* | `features/settings/ingresos-recurrentes/` |
| Presupuesto mensual objetivo | `PresupuestoObjetivo` | `features/settings/presupuesto-objetivo/` |
| Moneda y formato | `MonedaFormato` | `features/settings/moneda-formato/` |

---

## d) Árbol de directorios

```
planificador-inteligente/                      (carpeta existente; el producto se llama Fintrack)
├── design/design_handoff_fintrack/            ← MOVER aquí desde public/ (ver §g-1)
├── docs/
│   ├── FASE-0.md                              (este documento)
│   └── decisiones.md                          (ADR cortos por fase)
├── scripts/
│   ├── seed-10k.ts                            siembra 10.000 eventos aleatorios en una BD de prueba
│   └── bench-analytics.ts                     mide AnalyticsService con 10k eventos (objetivo < 16 ms)
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json                        ventana, CSP, bundle, plugins
│   ├── build.rs
│   ├── capabilities/default.json              permisos: sql, dialog, fs (appData + rutas elegidas), http (solo 127.0.0.1:11434 / localhost:11434)
│   ├── icons/
│   └── src/
│       ├── main.rs
│       ├── lib.rs                             registro de plugins + comandos
│       └── db_tx.rs                           comando `db_transaction` (ver §g-8)
├── src/
│   ├── main.ts
│   ├── index.html
│   ├── styles.scss                            reset + fuentes + tokens + controles globales
│   ├── styles/
│   │   ├── _tokens.scss                       custom properties del §b
│   │   ├── _breakpoints.scss                  mapa $ft-breakpoints + mixin ft-media()
│   │   ├── _typography.scss                   mixins de roles + .num
│   │   ├── _controls.scss                     .ft-btn, .ft-input, .ft-select, .ft-textarea, .ft-card, .ft-link
│   │   ├── _animations.scss                   @keyframes shim, pulse
│   │   └── _fonts.scss                        @font-face Inter (woff2 local)
│   ├── assets/fonts/inter/                    Inter 400/500/600/700 woff2 (app) + ttf (PDF)
│   └── app/
│       ├── app.ts / app.html / app.config.ts / app.routes.ts
│       ├── core/
│       │   ├── types/
│       │   │   ├── money.ts                   type Money (branded) + toMoney/fromMoney
│       │   │   ├── iso-date.ts                type IsoDate (branded) + helpers (date-fns por debajo)
│       │   │   ├── result.ts                  Result<T,E>, ok/err/map/andThen
│       │   │   ├── event.ts                   EventType, Nature, Event, EventDraft, EventMeta por tipo
│       │   │   ├── recurrence.ts              Recurrence, Frequency, VirtualEvent
│       │   │   ├── category.ts
│       │   │   ├── ai-report.ts               AiReport, Finding, Recommendation, ReportStatus
│       │   │   └── settings.ts                SettingsKey, Settings tipado
│       │   ├── format/
│       │   │   ├── money-format.ts            formatMoney / parseMoney es-ES (1.234,56 €)
│       │   │   ├── date-format.ts             DD/MM/AAAA · AAAA-MM-DD · "9 sep" · "Semana 36 · 1–7 sep 2026"
│       │   │   └── percent-format.ts          "68,5 %" · "▲ 4,8 %"
│       │   ├── ids/uuid-v7.ts
│       │   └── errors/app-error.ts            AppError discriminado (Db, Validation, Ollama, Export, Fs)
│       ├── data/
│       │   ├── db/
│       │   │   ├── database.ts                apertura (appDataDir/fintrack.db), PRAGMAs, puntero de ubicación
│       │   │   ├── unit-of-work.ts            runInTransaction(stmts) → Result (comando Rust)
│       │   │   ├── migrations/
│       │   │   │   ├── index.ts               registro ordenado
│       │   │   │   ├── 0001-initial.ts
│       │   │   │   └── 0002-seed-categories.ts
│       │   │   └── migrator.ts                aplica pendientes, idempotente, schema_migrations
│       │   ├── repositories/
│       │   │   ├── events.repository.ts
│       │   │   ├── recurrences.repository.ts
│       │   │   ├── categories.repository.ts
│       │   │   ├── ai-reports.repository.ts
│       │   │   └── settings.repository.ts
│       │   └── mappers/                       fila SQL ↔ tipo de dominio (JSON meta, Money, IsoDate)
│       ├── domain/                            puro: sin Angular, sin Tauri
│       │   ├── events/event.service.ts        validación, crear/editar/borrar, materialización
│       │   ├── recurrence/recurrence.service.ts   expand(rule, from, to)
│       │   ├── analytics/
│       │   │   ├── analytics.service.ts       computeSnapshot(events, range, opts)
│       │   │   ├── snapshot.ts                tipos del snapshot inmutable
│       │   │   ├── aggregation.ts             día / semana ISO / mes / año
│       │   │   └── stats.ts                   mediana, varianza, desviación, medias móviles (enteros)
│       │   ├── budget/budget.service.ts       burn rate, proyección de cierre, ritmo
│       │   ├── calculator/
│       │   │   ├── calculator-engine.ts       evaluación estándar en céntimos/decimales exactos
│       │   │   └── financial.ts               % de importe, dividir entre N, interés compuesto con aportación
│       │   ├── ai/
│       │   │   ├── weekly-summary.builder.ts  resumen compacto y determinista de la semana
│       │   │   ├── prompt.ts                  system prompt + esquema JSON
│       │   │   ├── report-schema.ts           Zod
│       │   │   └── report-parser.ts           parse + reintento con error inyectado
│       │   ├── export/
│       │   │   ├── export-model.ts            contenido común a los 3 formatos
│       │   │   ├── excel.exporter.ts
│       │   │   ├── pdf.exporter.ts
│       │   │   └── docx.exporter.ts
│       │   └── backup/backup.service.ts       copiar/restaurar fintrack.db (VACUUM INTO)
│       ├── infra/                             adaptadores Tauri (única capa que toca @tauri-apps/*)
│       │   ├── ollama/ollama.client.ts        /api/chat streaming, /api/tags, latencia
│       │   ├── fs/file-dialog.ts              save/open nativos
│       │   ├── fs/attachments.ts
│       │   └── platform/breakpoint.service.ts ResizeObserver sobre el shell → signal<'mobile'|'tablet'|'desktop'>
│       ├── facades/                           signals + computed; única API que ven los componentes
│       │   ├── events.facade.ts
│       │   ├── event-form.facade.ts
│       │   ├── dashboard.facade.ts
│       │   ├── analytics.facade.ts
│       │   ├── ai.facade.ts
│       │   ├── calculator.facade.ts
│       │   ├── settings.facade.ts
│       │   └── app-status.facade.ts           arranque, migraciones, toasts
│       ├── layout/                            Shell, Sidebar, TabBar, Fab, CabeceraPagina
│       ├── shared/
│       │   ├── components/                    (§c)
│       │   ├── directives/chart.directive.ts
│       │   ├── directives/atajo-global.directive.ts   Ctrl/Cmd+K, Ctrl/Cmd+Enter
│       │   └── pipes/money.pipe.ts · fecha.pipe.ts · porcentaje.pipe.ts
│       └── features/
│           ├── dashboard/
│           ├── events/{event-form,event-list}/
│           ├── analytics/
│           ├── ai/
│           ├── calculator/
│           └── settings/
├── angular.json · package.json · tsconfig*.json · vitest.config.ts
└── README.md                                  arranque dev, build Win/mac/Linux, ruta del .db, Ollama
```

Tests (`*.spec.ts`) junto a cada fichero. Obligatorios: `analytics.service.spec.ts`, `recurrence.service.spec.ts`, `money-format.spec.ts` + `money.spec.ts`, `report-parser.spec.ts`, `calculator-engine.spec.ts`, `financial.spec.ts`, `migrator.spec.ts` (con SQL en memoria simulado).

---

## e) Esquema SQL definitivo

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  icon        TEXT    NULL,
  color       TEXT    NOT NULL CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  kind        TEXT    NOT NULL CHECK (kind IN ('expense','income','both')),
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_name ON categories(name COLLATE NOCASE);
CREATE INDEX        IF NOT EXISTS ix_categories_kind_sort ON categories(kind, sort_order);

CREATE TABLE IF NOT EXISTS recurrences (
  id              TEXT    PRIMARY KEY,
  type            TEXT    NOT NULL CHECK (type IN ('expense','income','subscription','direct_debit','saving','investment')),
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  category_id     TEXT    NULL REFERENCES categories(id) ON DELETE SET NULL,
  concept         TEXT    NOT NULL,
  frequency       TEXT    NOT NULL CHECK (frequency IN ('weekly','monthly','yearly')),
  interval        INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1),
  day_of_month    INTEGER NULL CHECK (day_of_month BETWEEN 1 AND 31),
  weekday         INTEGER NULL CHECK (weekday BETWEEN 1 AND 7),          -- ISO: 1 = lunes
  start_date      TEXT    NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date        TEXT    NULL     CHECK (end_date   GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  payment_method  TEXT    NULL,                                          -- (añadido) se copia a las instancias
  meta            TEXT    NULL CHECK (meta IS NULL OR json_valid(meta)),
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_recurrences_active_start ON recurrences(active, start_date);

CREATE TABLE IF NOT EXISTS events (
  id              TEXT    PRIMARY KEY,                                  -- uuid v7
  type            TEXT    NOT NULL CHECK (type IN ('expense','income','subscription','direct_debit','saving','investment')),
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  date            TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  concept         TEXT    NOT NULL,
  category_id     TEXT    NULL REFERENCES categories(id) ON DELETE SET NULL,
  nature          TEXT    NULL CHECK (nature IS NULL OR nature IN ('fixed','variable')),
  payment_method  TEXT    NULL,
  notes           TEXT    NULL,
  attachment_path TEXT    NULL,
  recurrence_id   TEXT    NULL REFERENCES recurrences(id) ON DELETE SET NULL,
  meta            TEXT    NULL CHECK (meta IS NULL OR json_valid(meta)),
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);
CREATE INDEX        IF NOT EXISTS ix_events_date            ON events(date);
CREATE INDEX        IF NOT EXISTS ix_events_type_date       ON events(type, date);
CREATE INDEX        IF NOT EXISTS ix_events_category_date   ON events(category_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_events_recurrence_date ON events(recurrence_id, date) WHERE recurrence_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_reports (
  id                     TEXT    PRIMARY KEY,
  week_start             TEXT    NOT NULL,                              -- lunes ISO
  week_end               TEXT    NOT NULL,
  model                  TEXT    NOT NULL,
  generated_at           TEXT    NOT NULL,
  status                 TEXT    NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),  -- (añadido)
  verdict                TEXT    NULL,
  findings               TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(findings)),
  recommendations        TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(recommendations)),
  savings_potential_cents INTEGER NOT NULL DEFAULT 0,
  summary_input          TEXT    NULL CHECK (summary_input IS NULL OR json_valid(summary_input)),        -- (añadido) contexto enviado
  duration_ms            INTEGER NULL,                                                                   -- (añadido) "34 s"
  error                  TEXT    NULL                                                                    -- (añadido) causa del fallo
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_reports_week ON ai_reports(week_start);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
```

### Justificación de cada índice
| Índice | Por qué |
|---|---|
| `ix_events_date` | Todas las consultas del dashboard, la analítica y el listado son rangos `date BETWEEN ? AND ?` (mes visible, ventana de 6 meses, rango del filtro). Es el índice de acceso principal; con `date` en texto ISO el orden lexicográfico coincide con el cronológico. |
| `ix_events_type_date` | Totales por tipo en rango (KPI, comparativa ingresos/gastos/inversión, filtro "Tipos"). Evita leer todos los tipos para sumar uno. |
| `ix_events_category_date` | Tabla de desglose por categoría, filtro "Categorías", contador "N movimientos" de Ajustes y el `ON DELETE SET NULL` de la FK (SQLite recorre la tabla hija al borrar una categoría; sin índice sería un escaneo completo). |
| `ux_events_recurrence_date` (único, parcial) | Idempotencia de la materialización: una regla solo puede tener una fila por fecha, así que el `INSERT … ON CONFLICT DO NOTHING` garantiza que una instancia ya materializada (y posiblemente editada a mano) nunca se duplica ni se sobrescribe. También acelera "¿qué fechas de esta regla ya son reales?" al proyectar `expand()`. Parcial para no indexar los eventos manuales (`recurrence_id IS NULL`). |
| `ix_recurrences_active_start` | `expand()` solo carga reglas activas cuyo `start_date` sea anterior al fin del rango; el listado de "Próximos cargos" e "Ingresos recurrentes" hace la misma consulta. |
| `ux_categories_name` (NOCASE) | Impide duplicar "Hogar" / "hogar" desde el editor de categorías; el chip usa el nombre como etiqueta única. |
| `ix_categories_kind_sort` | Los chips del formulario piden `WHERE kind IN (?, 'both') ORDER BY sort_order`; es la consulta que se ejecuta en cada apertura del formulario. |
| `ux_ai_reports_week` | Un informe por semana: "regenerar sobrescribe" se implementa con `INSERT … ON CONFLICT(week_start) DO UPDATE`. La timeline ordena por `week_start DESC` sobre este mismo índice. |

Claves y reglas: FK `events.category_id` y `recurrences.category_id` con `ON DELETE SET NULL` (borrar una categoría no borra movimientos; el chip muestra "categoría eliminada" en error solo mientras dure el borrado en curso, y después las filas quedan "Sin categoría"). FK `events.recurrence_id ON DELETE SET NULL`: al borrar una regla las instancias ya materializadas se conservan como movimientos sueltos (son historia real). Nunca `DROP`; las migraciones solo añaden.

### Semilla (migración 0002)
Categorías `kind = 'expense'`, `is_system = 1`, en el orden de los chips del handoff:

| Nombre | Color | Origen |
|---|---|---|
| Alimentación | `#F45B5B` | handoff (Ajustes) |
| Hogar | `#FBBF24` | handoff |
| Transporte | `#38BDF8` | handoff |
| Ocio | `#6E56F8` | handoff |
| Salud | `#22C55E` | handoff |
| Formación | `#9BA3AF` | handoff |
| Viajes | `#C24B4B` | **propuesta mía** (2.º tono de la rampa de gasto; no introduce color nuevo) |
| Otros | `#6B7280` | **propuesta mía** (text-3) |

`kind = 'income'` (**propuesta mía**, el handoff no define categorías de ingreso): Nómina `#22C55E`, Otros ingresos `#9BA3AF`. `icon` queda `NULL`: el handoff no usa iconos de categoría (usa muestra de color e iniciales del concepto en el avatar).

Settings iniciales: `budget_target_cents=175000`, `currency=EUR`, `date_format=DD/MM/YYYY`, `ollama_endpoint=http://127.0.0.1:11434`, `ollama_model=llama3.1:8b`, `last_backup_at=` (vacío), `week_starts_on=1`.

---

## f) Interfaces públicas (solo firmas)

### Tipos base
```ts
// core/types/money.ts
export type Money = number & { readonly __brand: 'Money' };          // céntimos, entero
export function money(cents: number): Money;                           // lanza si no es entero seguro
export function addMoney(a: Money, b: Money): Money;
export function subMoney(a: Money, b: Money): Money;
export function mulMoney(a: Money, factor: number): Money;             // redondeo half-even al céntimo
export function divMoney(a: Money, divisor: number): Money;
export function sumMoney(values: Iterable<Money>): Money;
export function ratioPermille(num: Money, den: Money): number | null;  // ‰ entero; null si den = 0

// core/format/money-format.ts
export function formatMoney(m: Money, opts?: { sign?: 'auto' | 'always' | 'never'; symbol?: boolean }): string; // "1.234,56 €"
export function parseMoney(input: string): Result<Money, ValidationError>;                                   // "1.234,56" | "1234.56" | "12,5"

// core/types/iso-date.ts
export type IsoDate = string & { readonly __brand: 'IsoDate' };         // 'YYYY-MM-DD'
export function isoDate(y: number, m: number, d: number): IsoDate;
export function parseIsoDate(s: string): Result<IsoDate, ValidationError>;
export function todayIso(): IsoDate;
export function addDays(d: IsoDate, n: number): IsoDate;
export function addMonthsClamped(d: IsoDate, n: number, dayOfMonth: number): IsoDate; // política "último día del mes"
export function startOfMonth(d: IsoDate): IsoDate;  export function endOfMonth(d: IsoDate): IsoDate;
export function startOfIsoWeek(d: IsoDate): IsoDate; export function isoWeek(d: IsoDate): { year: number; week: number };
export function daysBetween(a: IsoDate, b: IsoDate): number;
export function compareIso(a: IsoDate, b: IsoDate): -1 | 0 | 1;

// core/types/result.ts
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };
export function ok<T>(value: T): Result<T, never>;
export function err<E>(error: E): Result<never, E>;
export function map<T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E>;
export function andThen<T, U, E>(r: Result<T, E>, f: (t: T) => Result<U, E>): Result<U, E>;
export function tryCatch<T>(f: () => Promise<T>, toError: (e: unknown) => AppError): Promise<Result<T, AppError>>;

// core/errors/app-error.ts
export type AppError =
  | { kind: 'db'; message: string; cause?: unknown }
  | { kind: 'validation'; field: string; message: string }
  | { kind: 'not_found'; entity: string; id: string }
  | { kind: 'ollama'; reason: 'not_detected' | 'model_missing' | 'timeout' | 'invalid_json' | 'http'; message: string }
  | { kind: 'export'; message: string }
  | { kind: 'fs'; message: string };
```

### Dominio (tipos)
```ts
export type EventType = 'expense' | 'income' | 'subscription' | 'direct_debit' | 'saving' | 'investment';
export type Nature = 'fixed' | 'variable';
export type Frequency = 'weekly' | 'monthly' | 'yearly';

export type EventMeta =
  | { type: 'expense' }
  | { type: 'income'; source?: string }
  | { type: 'subscription'; service?: string }
  | { type: 'direct_debit'; issuer?: string }
  | { type: 'saving'; account?: string; goal?: string }
  | { type: 'investment'; ticker: string; platform?: string; assetClass?: 'index_fund' | 'etf' | 'stock' | 'crypto' | 'pension' };

export interface Event {
  readonly id: string; readonly type: EventType; readonly amountCents: Money; readonly date: IsoDate;
  readonly concept: string; readonly categoryId: string | null; readonly nature: Nature | null;
  readonly paymentMethod: string | null; readonly notes: string | null; readonly attachmentPath: string | null;
  readonly recurrenceId: string | null; readonly meta: EventMeta | null;
  readonly createdAt: string; readonly updatedAt: string;
}
export type EventDraft = Omit<Event, 'id' | 'createdAt' | 'updatedAt'>;
export type EventPatch = Partial<Omit<EventDraft, 'type'>>;

export interface Recurrence {
  readonly id: string; readonly type: EventType; readonly amountCents: Money; readonly categoryId: string | null;
  readonly concept: string; readonly frequency: Frequency; readonly interval: number;
  readonly dayOfMonth: number | null; readonly weekday: number | null;
  readonly startDate: IsoDate; readonly endDate: IsoDate | null; readonly active: boolean;
  readonly paymentMethod: string | null; readonly meta: EventMeta | null;
}
export type RecurrenceDraft = Omit<Recurrence, 'id'>;

export interface VirtualEvent {                    // proyección, no persistida
  readonly recurrenceId: string; readonly date: IsoDate; readonly type: EventType; readonly amountCents: Money;
  readonly concept: string; readonly categoryId: string | null; readonly materialized: boolean;
}

export interface Category { readonly id: string; readonly name: string; readonly icon: string | null; readonly color: string;
  readonly kind: 'expense' | 'income' | 'both'; readonly isSystem: boolean; readonly sortOrder: number; }

export interface Finding { title: string; detail: string; amount_cents: number; severity: 'low' | 'medium' | 'high' }
export interface Recommendation { action: string; rationale: string; monthly_impact_cents: number; effort: 'low' | 'medium' | 'high'; applied?: boolean }
export interface AiReport { readonly id: string; readonly weekStart: IsoDate; readonly weekEnd: IsoDate; readonly model: string;
  readonly generatedAt: string; readonly status: 'completed' | 'failed'; readonly verdict: string | null;
  readonly findings: readonly Finding[]; readonly recommendations: readonly Recommendation[];
  readonly savingsPotentialCents: Money; readonly durationMs: number | null; readonly error: string | null; }

export interface DateRange { readonly from: IsoDate; readonly to: IsoDate }
export type Granularity = 'day' | 'week' | 'month' | 'year';
export interface EventFilters { readonly range: DateRange; readonly categoryIds: readonly string[]; readonly types: readonly EventType[]; readonly search?: string }
```

### Capa de datos
```ts
// data/db/database.ts
export interface DatabaseHandle {
  select<Row extends object>(sql: string, params?: readonly SqlValue[]): Promise<Result<readonly Row[]>>;
  transaction(statements: readonly SqlStatement[]): Promise<Result<TransactionOutcome>>;   // atómica (§g-8)
  path(): string;
}
export interface SqlStatement { readonly sql: string; readonly params?: readonly SqlValue[] }
export type SqlValue = string | number | null;
export interface TransactionOutcome { readonly rowsAffected: number }
export function openDatabase(location: DbLocation): Promise<Result<DatabaseHandle>>;

// data/db/migrator.ts
export interface Migration { readonly version: number; readonly name: string; readonly statements: readonly string[] }
export function applyPendingMigrations(db: DatabaseHandle, migrations: readonly Migration[]): Promise<Result<{ applied: number[] }>>;

// data/repositories/events.repository.ts
export interface EventsRepository {
  findById(id: string): Promise<Result<Event | null>>;
  findInRange(range: DateRange, filters?: Partial<EventFilters>): Promise<Result<readonly Event[]>>;
  findRecent(limit: number): Promise<Result<readonly Event[]>>;
  countAll(): Promise<Result<number>>;
  countByCategory(): Promise<Result<ReadonlyMap<string, number>>>;
  materializedDates(recurrenceId: string, range: DateRange): Promise<Result<ReadonlySet<IsoDate>>>;
  insert(draft: EventDraft, id?: string): Promise<Result<Event>>;
  insertManyIfAbsent(drafts: readonly (EventDraft & { recurrenceId: string })[]): Promise<Result<{ inserted: number }>>; // ON CONFLICT DO NOTHING
  update(id: string, patch: EventPatch): Promise<Result<Event>>;
  delete(id: string): Promise<Result<void>>;
}

// data/repositories/recurrences.repository.ts
export interface RecurrencesRepository {
  findAll(opts?: { activeOnly?: boolean; types?: readonly EventType[] }): Promise<Result<readonly Recurrence[]>>;
  findById(id: string): Promise<Result<Recurrence | null>>;
  insert(draft: RecurrenceDraft): Promise<Result<Recurrence>>;
  update(id: string, patch: Partial<RecurrenceDraft>): Promise<Result<Recurrence>>;
  setActive(id: string, active: boolean, asOf: IsoDate): Promise<Result<void>>;   // fija end_date = asOf − 1 al desactivar
  delete(id: string): Promise<Result<void>>;
}

// data/repositories/categories.repository.ts
export interface CategoriesRepository {
  findAll(kind?: 'expense' | 'income'): Promise<Result<readonly Category[]>>;
  insert(draft: Omit<Category, 'id'>): Promise<Result<Category>>;
  update(id: string, patch: Partial<Omit<Category, 'id' | 'isSystem'>>): Promise<Result<Category>>;
  delete(id: string): Promise<Result<void>>;
  reorder(ids: readonly string[]): Promise<Result<void>>;
}

// data/repositories/ai-reports.repository.ts
export interface AiReportsRepository {
  findAll(): Promise<Result<readonly AiReport[]>>;                       // week_start DESC
  findByWeek(weekStart: IsoDate): Promise<Result<AiReport | null>>;
  upsert(report: AiReport & { summaryInput: unknown }): Promise<Result<AiReport>>;
  setRecommendationApplied(id: string, index: number, applied: boolean): Promise<Result<void>>;
}

// data/repositories/settings.repository.ts
export interface SettingsRepository {
  getAll(): Promise<Result<Settings>>;
  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<Result<void>>;
}
export interface Settings { budgetTargetCents: Money; currency: 'EUR'; dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD';
  ollamaEndpoint: string; ollamaModel: string; lastBackupAt: string | null; weekStartsOn: 1 }
```

### Servicios de dominio (puros, sin Angular)
```ts
// domain/events/event.service.ts
export interface EventService {
  validate(draft: EventDraft): Result<EventDraft, ValidationError[]>;   // importe > 0, categoría en gasto, ticker en inversión, fecha válida
  create(draft: EventDraft, recurrence?: RecurrenceDraft): Promise<Result<{ event: Event; recurrence: Recurrence | null }>>;
  update(id: string, patch: EventPatch): Promise<Result<Event>>;
  remove(id: string): Promise<Result<void>>;
  materializeDue(rules: readonly Recurrence[], upTo: IsoDate): Promise<Result<{ inserted: number }>>; // al arrancar y al cambiar de día
}

// domain/recurrence/recurrence.service.ts
export function expand(rule: Recurrence, from: IsoDate, to: IsoDate): readonly VirtualEvent[];          // pura, determinista
export function nextOccurrence(rule: Recurrence, after: IsoDate): IsoDate | null;
export function mergeWithMaterialized(virtual: readonly VirtualEvent[], real: ReadonlySet<IsoDate>): readonly VirtualEvent[]; // la edición manual gana

// domain/analytics/analytics.service.ts
export interface AnalyticsInput { readonly events: readonly Event[]; readonly range: DateRange; readonly granularity: Granularity;
  readonly previousPeriods: readonly (readonly Event[])[]; readonly budgetTargetCents: Money; readonly today: IsoDate; readonly categories: ReadonlyMap<string, Category> }
export function computeSnapshot(input: AnalyticsInput): AnalyticsSnapshot;

export interface AnalyticsSnapshot {
  readonly range: DateRange; readonly granularity: Granularity; readonly eventCount: number;
  readonly totalsByType: Readonly<Record<EventType, Money>>;
  readonly income: Money; readonly expenses: Money; readonly outflow: Money;           // outflow = expense + subscription + direct_debit
  readonly balance: Money;                                                             // income − outflow − saving − investment
  readonly savingsRatePermille: number | null;                                         // null si income = 0
  readonly expenseShareOfIncomePermille: number | null;
  readonly byCategory: readonly CategoryBreakdown[];                                   // total, count, % gasto, % ingresos, media, var. periodo
  readonly byExpenseKind: Readonly<Record<'fixed' | 'variable' | 'leisure' | 'subscriptions', Money>>; // donut (§g-4)
  readonly dailyAverage: Money | null; readonly medianPerEvent: Money | null; readonly averagePerEvent: Money | null;
  readonly vsPreviousMean: { deltaPermille: number | null; varianceCents2: number | null; stdDevCents: number | null };
  readonly series: readonly PeriodPoint[];                                             // por bucket de la granularidad
  readonly cumulativeBalance: readonly { date: IsoDate; balance: Money }[];
  readonly movingAverage7: readonly (Money | null)[]; readonly movingAverage30: readonly (Money | null)[];
  readonly movingAverage3Periods: readonly (Money | null)[];                            // la que dibuja el handoff
  readonly burn: { dailyRate: Money | null; projectedClose: Money | null; budgetTargetCents: Money; overBudget: boolean; dayOfPeriod: number; daysInPeriod: number; elapsedPermille: number; consumedPermille: number | null; pacePointsDelta: number | null };
  readonly comparison: { previous: PeriodTotals | null; deltaAbs: Money | null; deltaPermille: number | null };
}
export interface CategoryBreakdown { categoryId: string | null; label: string; color: string; count: number; total: Money;
  shareOfExpensesPermille: number | null; shareOfIncomePermille: number | null; averagePerEvent: Money; deltaVsPreviousPermille: number | null }
export interface PeriodPoint { key: string; label: string; from: IsoDate; to: IsoDate; income: Money; expenses: Money; investment: Money; saving: Money; balance: Money }
export function aggregate(events: readonly Event[], granularity: Granularity, range: DateRange): readonly PeriodPoint[];

// domain/calculator
export interface CalculatorEngine { input(key: CalcKey): CalcState; state(): CalcState; reset(): void }
export interface CalcState { expression: string; display: string; result: Money | null; history: readonly { op: string; result: Money }[] }
export function percentOf(amount: Money, percent: number): Money;
export function splitBetween(amount: Money, people: number): { each: Money; remainder: Money };
export function compoundInterest(p: { principal: Money; monthlyContribution: Money; years: number; annualRatePermille: number }): { finalValue: Money; contributed: Money; interest: Money };

// domain/ai
export function buildWeeklySummary(p: { week: DateRange; events: readonly Event[]; previous4Weeks: readonly (readonly Event[])[];
  activeSubscriptions: readonly Recurrence[]; categories: ReadonlyMap<string, Category>; budgetTargetCents: Money }): WeeklySummary; // determinista, ordenado
export const REPORT_SCHEMA: z.ZodType<ReportPayload>;
export function parseReport(raw: string): Result<ReportPayload, { kind: 'invalid_json'; issues: string[] }>;
export function buildMessages(summary: WeeklySummary, retryError?: string): readonly ChatMessage[];

// domain/export
export interface ExportModel { period: DateRange; summary: AnalyticsSnapshot; charts: { comparison: string | null; balance: string | null }; // PNG data URL 2x
  categories: readonly CategoryBreakdown[]; movements: readonly Event[]; options: ExportOptions }
export interface ExportOptions { format: 'xlsx' | 'pdf' | 'docx'; range: DateRange; includeCharts: boolean; includeBreakdown: boolean; includeRawMovements: boolean }
export interface Exporter { readonly format: ExportOptions['format']; build(model: ExportModel): Promise<Result<Uint8Array>> }

// domain/backup
export interface BackupService { createBackup(targetPath: string): Promise<Result<{ bytes: number }>>; restoreFrom(sourcePath: string): Promise<Result<void>>; dbInfo(): Promise<Result<{ path: string; bytes: number; events: number; lastBackupAt: string | null }>> }
```

### Infraestructura (adaptadores Tauri)
```ts
export interface OllamaClient {
  ping(endpoint: string): Promise<Result<{ latencyMs: number }>>;                     // GET /
  listModels(endpoint: string): Promise<Result<readonly string[]>>;                   // GET /api/tags
  chat(p: { endpoint: string; model: string; messages: readonly ChatMessage[]; schema: object; timeoutMs: number; signal: AbortSignal;
    onToken: (partial: string, tokens: number) => void }): Promise<Result<{ text: string; durationMs: number }>>; // POST /api/chat stream
}
export interface FileDialogs { pickSavePath(p: { defaultName: string; extension: string }): Promise<string | null>; pickOpen(p: { extensions: string[] }): Promise<string | null> }
export interface BreakpointService { readonly current: Signal<'mobile' | 'tablet' | 'desktop'> }
```

### Facades (signals; lo único que importan los componentes)
```ts
export class EventsFacade {
  readonly events: Signal<readonly Event[]>; readonly loading: Signal<boolean>; readonly error: Signal<AppError | null>;
  readonly filters: WritableSignal<EventFilters>; readonly filtered: Signal<readonly Event[]>; readonly groupedByDay: Signal<readonly { date: IsoDate; items: readonly Event[] }[]>;
  readonly categories: Signal<readonly Category[]>; readonly categoryById: Signal<ReadonlyMap<string, Category>>;
  load(range: DateRange): Promise<void>; remove(id: string): Promise<Result<void>>; clearFilters(): void;
}
export class EventFormFacade {
  readonly mode: Signal<'create' | 'edit'>; readonly type: WritableSignal<EventType>; readonly form: FormGroup<EventFormControls>;
  readonly value: Signal<EventFormValue>; readonly errors: Signal<ReadonlyMap<string, string>>; readonly recurrenceEnabled: Signal<boolean>;
  readonly visibleFields: Signal<ReadonlySet<FieldKey>>; readonly saving: Signal<boolean>; readonly attachment: Signal<{ name: string; bytes: number } | null>;
  init(p: { id?: string; presetAmount?: Money }): Promise<void>; setType(t: EventType): void;
  save(): Promise<Result<Event>>; saveAndAddAnother(): Promise<Result<Event>>;   // conserva fecha, categoría y tipo
  attach(): Promise<void>; detach(): void;
}
export class DashboardFacade {
  readonly currentMonth: WritableSignal<IsoDate>; readonly today: Signal<IsoDate>; readonly monthLabel: Signal<string>;
  readonly snapshot: Signal<AnalyticsSnapshot | null>; readonly previousSnapshot: Signal<AnalyticsSnapshot | null>;
  readonly kpis: Signal<readonly KpiCard[]>; readonly sparklines6m: Signal<Readonly<Record<'income' | 'expense' | 'saving' | 'investment', readonly Money[]>>>;
  readonly weeks: Signal<readonly WeekStack[]>; readonly donut: Signal<readonly DonutSlice[]>;
  readonly upcoming: Signal<readonly VirtualEvent[]>; readonly upcomingTotal30d: Signal<Money>; readonly recent: Signal<readonly Event[]>;
  readonly loading: Signal<boolean>; readonly empty: Signal<boolean>;
  prevMonth(): void; nextMonth(): void; goToday(): void;
}
export class AnalyticsFacade {
  readonly filters: WritableSignal<AnalyticsFilters>;   // { granularity, range, categoryIds, types, sortColumn, sortDir }
  readonly snapshot: Signal<AnalyticsSnapshot | null>; readonly metrics: Signal<readonly MetricCard[]>;
  readonly comparisonOption: Signal<EChartsOption>; readonly balanceOption: Signal<EChartsOption>;
  readonly table: Signal<readonly CategoryBreakdown[]>; readonly totalsRow: Signal<CategoryBreakdown>;
  readonly exportOptions: WritableSignal<ExportOptions>; readonly exporting: Signal<boolean>;
  readonly loading: Signal<boolean>; readonly noResults: Signal<boolean>;
  setGranularity(g: Granularity): void; setRange(r: DateRange): void; toggleCategory(id: string): void; toggleType(t: EventType): void; clear(): void;
  sortBy(column: SortColumn): void; openExport(format: ExportOptions['format']): void; runExport(): Promise<Result<{ path: string }>>;
}
export class AiFacade {
  readonly modelStatus: Signal<'connected' | 'not_detected' | 'model_missing' | 'generating' | 'error'>; readonly latencyMs: Signal<number | null>;
  readonly reports: Signal<readonly AiReport[]>; readonly expandedId: WritableSignal<string | null>;
  readonly generating: Signal<{ weekStart: IsoDate; elapsedMs: number; tokens: number; progressPermille: number; eventCount: number } | null>;
  readonly latest: Signal<AiReport | null>; readonly savingsPotential: Signal<{ monthly: Money; yearly: Money; sources: readonly { label: string; amount: Money }[] }>;
  readonly fallbackMetrics: Signal<WeeklySummary | null>;   // cuando el último informe es 'failed'
  checkStatus(): Promise<void>; regenerate(weekStart?: IsoDate): Promise<Result<AiReport>>; cancel(): void; toggle(id: string): void; applyRecommendation(id: string, i: number): Promise<void>;
}
export class CalculatorFacade {
  readonly open: WritableSignal<boolean>; readonly tab: WritableSignal<'standard' | 'financial'>; readonly state: Signal<CalcState>;
  readonly financialMode: WritableSignal<'percent' | 'split' | 'compound'>; readonly financialInputs: WritableSignal<FinancialInputs>; readonly financialResult: Signal<FinancialResult | null>;
  readonly history: Signal<readonly HistoryEntry[]>; readonly usableResult: Signal<Money | null>;
  toggle(): void; press(key: CalcKey): void; reuse(entry: HistoryEntry): void; clearHistory(): void; useInNewEvent(): void;
}
export class SettingsFacade {
  readonly settings: Signal<Settings>; readonly dbInfo: Signal<{ path: string; bytes: number; events: number; lastBackupAt: string | null } | null>;
  readonly ollamaStatus: Signal<{ state: 'connected' | 'not_detected' | 'model_missing' | 'testing'; latencyMs: number | null }>; readonly models: Signal<readonly string[]>;
  readonly categories: Signal<readonly (Category & { count: number })[]>; readonly recurringIncome: Signal<readonly Recurrence[]>;
  readonly budgetReadout: Signal<{ avgIncome: Money | null; targetSavingsPermille: number | null }>;
  update<K extends keyof Settings>(key: K, value: Settings[K]): Promise<Result<void>>; testConnection(): Promise<void>;
  backup(): Promise<Result<void>>; restore(): Promise<Result<void>>; changeLocation(): Promise<Result<void>>;
  saveCategory(c: Partial<Category> & { name: string; color: string }): Promise<Result<Category>>; deleteCategory(id: string): Promise<Result<void>>;
  saveRecurringIncome(r: RecurrenceDraft): Promise<Result<Recurrence>>; deleteRecurring(id: string): Promise<Result<void>>;
}
export class AppStatusFacade {
  readonly boot: Signal<'opening' | 'migrating' | 'ready' | 'error'>; readonly bootError: Signal<AppError | null>;
  readonly toasts: Signal<readonly Toast[]>; notify(t: Omit<Toast, 'id'>): void; dismiss(id: string): void;
}
```

---

## g) Ambigüedades, contradicciones y decisiones que necesitan tu visto bueno

### Bloqueantes de entorno
1. **Rust / Tauri no están instalados en esta máquina.** Hay Node 22.22 y npm 10.9, pero no `cargo`, ni `rustc`, ni `tauri-cli`, ni Visual Studio Build Tools (MSVC), que Tauri exige en Windows. Puedo hacer todo el Angular sin ellos, pero **no puedo compilar la shell ni el ejecutable** hasta que instales `rustup` (https://rustup.rs) + "Desktop development with C++" de Build Tools. Propuesta: en Fase 1 dejo `src-tauri/` completo y verificable con `cargo check` en cuanto exista la toolchain; el resto de fases se desarrolla con `ng serve` + un adaptador de BD en memoria para tests. Tampoco hay Ollama instalado (necesario solo para Fase 7).
2. **El handoff vive en `public/`**, que Angular copia íntegro al build: el prototipo (280 KB + React desde CDN en `support.js`) acabaría dentro del ejecutable. Propuesta: moverlo a `design/design_handoff_fintrack/` en la raíz del proyecto (fuera de assets).
3. **Versión de Angular.** El scaffold pide `^21.0.0`; la última es 22.1.5. Fijaré la línea **21 LTS (21.2.22)** para cumplir "Angular 21". Aviso: TypeScript queda en `~5.9` (Angular 21 no soporta TS 7).

### Decisiones técnicas que interpretan tus reglas
4. **Signal forms**: en Angular 21.2 `@angular/forms/signals` sigue marcado experimental. Aplico tu regla: **Reactive Forms tipados** + `toSignal(form.valueChanges)` para que todo el estado derivado siga siendo `computed()`. Se justifica en el README.
5. **Temporal**: no está garantizado en los tres webviews de Tauri (WebView2, WKWebView, WebKitGTK) y no puedo verificarlo sin la toolchain. Uso **date-fns 4** encapsulado en `iso-date.ts` (un único fichero para migrar a Temporal cuando esté disponible).
6. **Formato es-ES**: `Intl.NumberFormat('es-ES')` **no** agrupa los millares en cifras de 4 dígitos ("1884,37 €" en vez de "1.884,37 €", regla CLDR `minimumGroupingDigits=2`). Como el handoff muestra siempre el punto de millar, implemento un formateador propio en enteros (sin `Intl` para moneda).
7. **Transacciones con `@tauri-apps/plugin-sql`**: el plugin usa un pool `sqlx` de varias conexiones; `BEGIN`/`COMMIT` en llamadas `execute()` separadas pueden caer en conexiones distintas y no ser atómicos. Propuesta: añadir en `src-tauri/src/db_tx.rs` un comando `db_transaction(statements[])` que toma **una** conexión del pool del propio plugin y ejecuta `BEGIN IMMEDIATE … COMMIT/ROLLBACK`. La lectura sigue usando el plugin tal cual; toda escritura pasa por `DatabaseHandle.transaction()` → `Result`. Cumple "SQLite mediante plugin-sql" y la regla 5.
8. **Ubicación del `.db`**: plugin-sql resuelve rutas relativas contra `appConfigDir`, no `appDataDir`. Pasaré la **ruta absoluta** `appDataDir()/fintrack.db`. Para "Cambiar" ubicación (Ajustes) hace falta un puntero fuera de la BD: fichero `appDataDir()/fintrack.location` (texto plano con la ruta). No es web storage; es un fichero.
9. **Ollama y CORS**: en Windows el origen del webview es `http://tauri.localhost`, que no está en la lista por defecto de `OLLAMA_ORIGINS`; `fetch` desde el webview puede fallar por CORS. Propuesta: usar `@tauri-apps/plugin-http` (petición desde Rust, sin CORS, con streaming) con **scope restringido en `capabilities` a `http://127.0.0.1:11434/*` y `http://localhost:11434/*`**. Así la regla "cero red salvo Ollama" queda impuesta por la shell, no solo por disciplina. CSP: `connect-src 'self' ipc: http://ipc.localhost`.
10. **`format: json`**: Ollama admite pasar el **JSON Schema** completo en `format` (structured outputs). Enviaré el esquema, que es estrictamente más fuerte que `'json'`; Zod valida igualmente y el reintento con error inyectado se mantiene.
11. **Excel y floats**: SheetJS necesita números para que el formato de moneda y `SUM()` funcionen. Convierto `amount_cents / 100` **solo en la frontera de exportación** (nunca en dominio ni almacenamiento). Además, el paquete `xlsx` de npm está congelado en 0.18.5; instalaré la 0.20.x desde el tarball oficial de SheetJS (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) como dependencia de package.json.
12. **Inter offline**: el README carga Inter desde Google Fonts, pero la app debe funcionar sin red → `@fontsource/inter` (woff2 local). Para el PDF jsPDF necesita TTF: vendorizaré Inter TTF (licencia OFL) en `src/assets/fonts/inter/`. Si prefieres no embeber TTF, el PDF usará Helvetica.
13. **Nombres de componentes**: el handoff nombra en español ("Fila de movimiento") y tu ejemplo en inglés ("MovementRow"). Aplico la regla literal: **nombres del handoff en español** (`FilaMovimiento`, `TarjetaKpi`, `ChipCategoria`…). Si prefieres inglés en el código, dímelo y renombro el mapa del §c.
14. **Nombre del proyecto**: la carpeta es `planificador-inteligente`; el producto, Fintrack. Mantengo la carpeta y renombro el proyecto Angular/Tauri a `fintrack` (`angular.json`, `package.json`, `productName`, `identifier: com.fintrack.app`).
15. **Rutas no listadas**: propongo `/events/:id` para editar (mismo `EventForm` en modo edición) y `/events/new?amount=6281` como entrada desde la calculadora.

### Contradicciones o huecos dentro del handoff
16. **Media móvil**: tus reglas piden MA de 7 y 30 días sobre el saldo acumulado; el gráfico de Analítica dibuja "Media móvil 3 m" (3 periodos en granularidad mes). Propuesta: `AnalyticsService` calcula las tres (`movingAverage7`, `movingAverage30`, `movingAverage3Periods`); el gráfico dibuja MA7/MA30 en granularidad Día (leyenda "Media móvil 7 d" / "30 d") y 3 periodos en Semana/Mes/Año, como en el handoff.
17. **"Varianza vs. media 3 m"**: el handoff muestra un delta relativo (`▼ 4,8 %`), no la varianza estadística. Propuesta: la tarjeta muestra el delta relativo del gasto actual frente a la media de los 3 periodos anteriores (con la regla de flecha/color del handoff); varianza y desviación típica se calculan igualmente, se incluyen en el resumen para la IA y en la exportación, y aparecen en el `title` de la tarjeta. No añado tarjeta nueva.
18. **Barra "Presupuesto consumido"**: el handoff la calcula sobre **ingresos** ("68,5 % de los ingresos") y no menciona el presupuesto objetivo de Ajustes; tus reglas piden proyección de cierre contra el **presupuesto objetivo**. Propuesta: la barra sigue el handoff (base = ingresos del mes; si no hay ingresos, base = presupuesto objetivo y pie "sobre el presupuesto objetivo"), y la proyección de cierre se muestra en la tarjeta KPI "Gastos" usando su estado **error** del handoff (borde `expense`, pie rojo: "Proyección 2.130,40 € · supera el objetivo de 1.750,00 €") solo cuando se supera.
19. **Donut "tipo de gasto" (fijo / variable / ocio / suscripciones)** mezcla naturaleza, categoría y tipo. Regla de derivación propuesta: **Suscripciones** = `type = subscription`; **Ocio** = `expense` con categoría Ocio o Viajes; **Fijo** = `expense.nature = fixed` + `direct_debit`; **Variable** = `expense.nature = variable` sin contar Ocio/Viajes. `nature` sigue aplicando solo a `expense` (no cambio tu modelo).
20. **Nombres de categoría inconsistentes**: los chips dicen "Hogar" y "Ocio"; la tabla de Analítica dice "Vivienda" y "Ocio y viajes"; la lista de Ajustes solo tiene 6 de los 8 chips. Propuesta: la semilla son los **8 chips del formulario** (nombres de Ajustes/formulario mandan) y "Vivienda"/"Ocio y viajes" se consideran datos de ejemplo. La fila "Suscripciones" de la tabla se genera agrupando por tipo los movimientos sin categoría (`subscription` → "Suscripciones", `direct_debit` → "Domiciliaciones").
21. **Fila de movimiento de una domiciliación**: "Alquiler Carrer de Sants" aparece como `Hogar · Fijo` en Movimientos y como `Domiciliación` en Próximos cargos. Regla: la meta muestra `categoría · (naturaleza si existe, si no el tipo) · fecha`. Un `direct_debit` con categoría Hogar sale como "Hogar · Domiciliación · 1 oct".
22. **Progreso "62 %" al generar**: el streaming de Ollama no informa del total. Propuesta: progreso = tiempo transcurrido / duración del último informe (guardada en `duration_ms`), limitado al 90 % hasta recibir el final; sin informe previo, se muestra la barra en modo indeterminado (mismo barrido `shim`).
23. **Botón "Aplicar" de una recomendación**: sin comportamiento definido. Propuesta: marca la recomendación como aplicada (`applied` en el JSON del informe), la tarjeta la muestra con `opacity .4` y "Aplicada", y "Potencial de ahorro" descuenta las aplicadas ("110,10 € /mes · 34,90 € ya aplicados").
24. **Signo/color del impacto**: "Subir la aportación al indexado" muestra `−70,00 €/mes` en verde. Sigo el handoff (siempre verde, signo visible).
25. **Datos de ejemplo que no cuadran** (no afectan al código, lo aviso): 11.209,19 € / 183 días = 61,25 €, no 61,37; "objetivo 30 %" en Analítica frente a "31,6 %" derivado en Ajustes; el total de suscripciones (65,98 €) no coincide con Netflix + Spotify + gimnasio (60,88 €). Todo se calculará desde los datos reales.
26. **"Guardar y añadir otro"**: el README dice que conserva **tipo y fecha**; tus reglas dicen **fecha y categoría**. Conservo las tres (tipo, fecha y categoría).
27. **Toggle "Recurrente" en Gasto** crea una regla `type = expense` (gasto recurrente, p. ej. clases); no lo convierte en suscripción. Es coherente con el modelo (la regla tiene `type`).
28. **Frecuencia en Suscripción/Domiciliación**: el handoff solo enseña el bloque de frecuencia bajo el toggle "recurrente" del gasto. Para Suscripción y Domiciliación propongo que el bloque esté **siempre visible** (son recurrentes por definición) sin toggle.

### Accesibilidad — pares de color que NO alcanzan AA (4,5:1 en texto normal). No los cambio; te lo señalo:
| Par | Ratio | Dónde | Alternativa si decides corregirlo |
|---|---|---|---|
| `#6B7280` (text-3) sobre `#131519` | 3,8:1 | metadatos de fila, pies de KPI, leyendas, placeholders, tab bar inactiva | `#808896` daría 5,1:1 (y 4,7:1 sobre `#1B1E24`) |
| `#6B7280` sobre `#1B1E24` | 3,5:1 | ayuda de inputs, notas | ídem |
| `#6B7280` sobre `#0A0B0D` | 4,1:1 | eyebrows, pies fuera de tarjeta | ídem |
| `#6E56F8` (acento) **como texto** sobre `#131519` / `#1B1E24` / `#0A0B0D` | 3,8 / 3,5 / 4,1:1 | enlaces "Ver los 31", "Limpiar", "Editar", "+ Añadir…", "Guardar y añadir otro", operadores de la calculadora | `#8B78FA` (ya existe en el prototipo como hover de enlace) da 5,4:1 sobre `#131519` |
| `#4B5563` sobre `#1B1E24` | 2,1:1 | segmento deshabilitado | exento (deshabilitado), lo dejo |

Los demás pares (blanco sobre acento 4,8:1; `#22C55E`, `#F45B5B`, `#FBBF24`, `#38BDF8` y `#9BA3AF` sobre superficies; `#0A0B0D` sobre `#38BDF8`) cumplen AA.

---

## Plan de fases (sin cambios respecto a tu orden)

| Fase | Entrega | Consume del handoff |
|---|---|---|
| 1 | Tauri + Angular 21 LTS zoneless, tokens SCSS, fuentes locales, `Shell`/`Sidebar`/`TabBar`/`Fab`/`CabeceraPagina`, rutas, `BreakpointService`, estilos globales de controles, skeleton, estado vacío | README (tokens, layout), `Sidebar.dc.html`, sección 0 y 7 (skeleton, vacío) |
| 2 | `Money`, `IsoDate`, `Result`, BD (apertura, migraciones, semilla, comando de transacción), repositorios, adaptador en memoria para tests | semilla de categorías (Ajustes) |
| 3 | `EventForm` con estrategias, `BloqueRecurrencia`, `AdjuntarRecibo`, `RecurrenceService` + tests, `EventList`, `FilaMovimiento`, `BadgeTipo`, `ChipCategoria`, `SegmentedControl`, `InputImporte`, `Toggle` | pantalla 2 (3 frames), componentes 7 |
| 4 | Dashboard completo, directiva `[chart]`, `TarjetaKpi` con sparkline, barras apiladas, donut, próximos cargos | pantalla 1 (3 frames) |
| 5 | `AnalyticsService` + tests + bench 10k, pantalla Analítica, filtros, tabla ordenable, gráficos con tooltip | pantalla 3 (3 frames) |
| 6 | Exportadores xlsx / pdf / docx, `MenuExportar`, `ModalExportar`, diálogo nativo | modal de exportación |
| 7 | `OllamaClient` streaming, resumen semanal, prompt, Zod, reintento, estados, timeline, potencial de ahorro | pantalla 4 (3 frames), tarjeta IA |
| 8 | Calculadora (estándar, financiera, historial, usar en evento), `PanelLateral`, atajos globales | pantalla 5 (3 frames) |
| 9 | Ajustes, backup/restore, cambio de ubicación, README final, empaquetado Win/mac/Linux | pantalla 6 (3 frames) |
