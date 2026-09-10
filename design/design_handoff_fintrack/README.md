# Handoff: Fintrack — app de escritorio de finanzas personales

## Overview
Fintrack es una aplicación de escritorio de finanzas personales para un único usuario, **local** (sin cuentas, sin login, sin nube). El usuario registra sus movimientos y la app le devuelve control visual de su dinero: dashboard del mes, alta de eventos, analítica con exportación, informes semanales generados por un modelo local (Ollama / Llama 3.1), calculadora y ajustes.

Este paquete documenta seis pantallas en tres anchos (1440 / 768 / 390), la hoja de componentes con todos sus estados, y los tokens de diseño.

## Framework destino: Angular 21 + Tauri v2
Este diseño se implementa en **Angular 21 sobre Tauri v2**, empaquetado como ejecutable de escritorio. No es una decisión abierta: la arquitectura del proyecto ya está fijada.

- **Angular 21**, componentes **standalone**, **zoneless** (`provideZonelessChangeDetection`).
- **Signals** para todo el estado; `computed()` para todo dato derivado. Nada que pueda derivarse se almacena.
- Nueva sintaxis de control de flujo: `@if`, `@for`, `@switch`, `@let`. Nada de `*ngIf` / `*ngFor`.
- TypeScript en `strict` + `noUncheckedIndexedAccess`. Cero `any`.
- **SCSS** con custom properties para los tokens de este documento, declaradas una sola vez en `:root`.
- **Sin librería de componentes UI** (nada de Material, PrimeNG o Tailwind). Todo el markup y el CSS se escriben a medida a partir de esta especificación.
- Gráficos con **ECharts**, envuelto en una directiva propia `[chart]` que recibe la opción como signal y llama a `setOption`. Nada de wrappers de terceros.
- Persistencia: **SQLite** vía `@tauri-apps/plugin-sql`. Ni `localStorage`, ni `sessionStorage`, ni IndexedDB.

## About the Design Files
Los ficheros HTML de este bundle son **referencias de diseño**: prototipos que muestran el aspecto y el comportamiento previstos, **no código de producción para copiar tal cual**. La tarea es **recrear estos diseños como componentes Angular standalone**, con plantillas propias y SCSS por componente.

Los ficheros `.dc.html` usan un runtime propio (`support.js`) con plantillas `{{ }}`, `<sc-for>` y `<sc-if>`. **No portes ese runtime**: léelos como maquetas. Sus construcciones tienen equivalente directo en Angular —`<sc-for>` → `@for` con `track`, `<sc-if>` → `@if`, `{{ }}` → interpolación con signals— pero la traducción es manual, no mecánica.

Todos los estilos del prototipo están **inline y son literales**, así que los valores exactos se leen directamente del markup. Al portarlos a Angular, esos literales **no se quedan inline**: pasan al SCSS del componente y consumen las custom properties de la tabla de tokens (`var(--color-expense)`, no `#F45B5B`). El único sitio donde puede quedar un valor calculado en la plantilla es el `conic-gradient` del donut y el ancho de las barras, que dependen de datos.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciado, radios y estados son finales. Recrea la UI con precisión de píxel. Los datos son de ejemplo pero realistas (perfil español, euros, nómina ~2.412,68 €) y están elegidos para que el diseño aguante importes de 4 y 5 dígitos con decimales.

Los importes del prototipo están escritos ya formateados. En la implementación **nunca se maquetan como texto**: vienen de enteros en céntimos (tipo `Money`) y se formatean con un pipe `money` en `es-ES`. Lo mismo con fechas y porcentajes.

---

## Design Tokens

Se declaran como custom properties CSS en `:root` (`styles.scss`) y se consumen con `var(--…)` desde el SCSS de cada componente. El nombre sugerido de cada variable va en la última columna.

### Color
| Token | Hex | Uso | Custom property |
|---|---|---|---|
| `bg` | `#0A0B0D` | Fondo base de la ventana | `--color-bg` |
| `surface` | `#131519` | Tarjetas, sidebar, barras pegajosas | `--color-surface` |
| `surface-elevated` | `#1B1E24` | Inputs, filas internas, teclas, chips inactivos | `--color-surface-elevated` |
| `border` | `#262A31` | Borde de 1px en todo (la elevación es por color + borde, **nunca** por box-shadow) | `--color-border` |
| `border-subtle` | `#1B1E24` | Separadores dentro de listas | `--color-border-subtle` |
| `text-1` | `#F2F4F7` | Texto primario | `--color-text-1` |
| `text-2` | `#9BA3AF` | Texto secundario, etiquetas | `--color-text-2` |
| `text-3` | `#6B7280` | Metadatos, placeholders | `--color-text-3` |
| `accent` | `#6E56F8` | Marca, acciones primarias, foco, selección | `--color-accent` |

### Semántica (sistema cerrado — se usa igual en gráficos, badges, importes y filtros, sin excepción)
| Token | Hex | Custom property |
|---|---|---|
| `income` | `#22C55E` | `--color-income` |
| `expense` | `#F45B5B` | `--color-expense` |
| `investment` | `#38BDF8` | `--color-investment` |
| `savings` | `#FBBF24` | `--color-savings` |

Este sistema debe existir **una sola vez** en el código. Define un mapa `EVENT_TYPE_COLOR: Record<EventType, string>` en el dominio y aliméntalo tanto desde las clases SCSS como desde las opciones de ECharts; que un gráfico y un badge del mismo tipo puedan divergir es un bug.

Convenciones derivadas:
- Fondo de badge/pill semántico = color semántico con alpha `1F` (12 %), texto = color semántico a plena opacidad. Ej. `background:#22C55E1F; color:#22C55E`. En SCSS, resuélvelo con `color-mix(in srgb, var(--color-income) 12%, transparent)` para no duplicar hex.
- Anillo de foco: `border:1px solid #6E56F8` + `box-shadow:0 0 0 3px #6E56F833`. Aplícalo con `:focus-visible`, no con `:focus`.
- Estado de fila activa: `background:#6E56F814` + `border:1px solid #6E56F8`.
- Rampa del donut de tipos de gasto (subdivisión del rojo de gasto, para no introducir colores nuevos): `#F45B5B`, `#C24B4B`, `#8F3A3A`, `#5C2A2A`.
- Deshabilitado: `opacity:0.4`–`0.45` sobre el estilo normal (no un color aparte).

### Tipografía
Inter (400 / 500 / 600 / 700). Cifras siempre con `font-variant-numeric: tabular-nums; letter-spacing:-0.01em` (clase `.num` en el prototipo; en Angular, una clase de utilidad global `.num` en `styles.scss`) y **alineadas a la derecha** en listas y tablas.

| Rol | Estilo |
|---|---|
| Display (saldo, importe protagonista, resultado calculadora) | `700 40px/1.1`, `letter-spacing:-0.02em` en titulares |
| Título de sección / KPI / veredicto IA | `600 24px/1` (`/1.3` cuando es frase larga) |
| Etiqueta de campo, fila de lista, botón | `500 15px/1` |
| Metadato, leyenda, ayuda | `400 13px/1` (`/1.4`–`/1.6` en párrafos) |
| Eyebrow de frame | `500 13px`, `letter-spacing:0.08em`, mayúsculas |

### Forma y espacio
- Radios: **12px** tarjetas y paneles; **8px** inputs, botones, teclas y filas internas; **999px** chips, badges y pills; **6px** el segmento activo dentro de un segmented control.
- Rejilla de 8px. Padding interno de tarjeta **20–24px** (16px en móvil). Separación entre secciones **32px** (20–24px en móvil).
- Bordes de 1px. Sin sombras difusas, sin degradados decorativos (la única excepción es el degradado de barrido del skeleton).
- Alturas de control: 44px input escritorio, 48px en móvil, 40px botón, 38px filtro, 32px chip, 36px chip móvil, 56–72px input de importe.
- Objetivos táctiles móvil: mínimo 44×44.

---

## Layout responsive
- **≥1024px**: sidebar vertical fija de **240px** (logo + 5 destinos + tarjeta de estado del fichero al pie). Contenido en grid de 12 columnas, `gap:20px`, padding `28px 32px 32px`.
- **768px**: sidebar colapsada a barra de iconos de **64px** (mismos destinos, sin etiquetas). Grid de 8 columnas equivalentes, padding 24px, `gap:16–20px`.
- **≤640px**: sin sidebar. **Tab bar inferior de 76px** con 5 destinos (Inicio, Movim., Analítica, IA, Ajustes), `background:#131519`, borde superior 1px. Una sola columna, tarjetas a ancho completo, padding 16px, y **scroll horizontal en los gráficos** que no caben (con la pista visible "desliza →").
- **"Nuevo evento"**: botón primario en la cabecera en escritorio; **FAB** de 56px (`#6E56F8`, glifo `+` 28px) en móvil, anclado abajo a la derecha, 16px del borde y 96px del fondo — la lista bajo él lleva 152px de padding inferior para que no tape ningún importe.

**Cómo se implementa en Angular**: los tres anchos son **tres layouts reales**, no uno que se estira. Resuélvelos con CSS (media queries + container queries donde aplique) siempre que se pueda; el layout no debe depender de JS. Cuando la diferencia sea estructural —sidebar vs. tab bar— usa un signal `viewport` alimentado por `matchMedia` en un servicio `ViewportService`, y conmuta con `@if`. Nunca uses `window.innerWidth` leído en un `computed`, ni listeners de `resize` para el layout.

---

## Screens / Views

### 1. Dashboard (mes en curso)
**Propósito**: leer el estado del mes de un vistazo y detectar si el ritmo de gasto va adelantado.

**Layout escritorio** (grid 12, secciones separadas 32px, de arriba abajo):
1. **Cabecera**: a la izquierda flechas `‹ ›` (32×32, r8, superficie + borde) alrededor de "Septiembre 2026" (600 24px, ancho mínimo 200px, centrado) y una pill "Hoy · 9 sep". A la derecha "Calculadora" (botón secundario 40px) y "+ Nuevo evento" (botón primario acento 40px).
2. **Hero (span 5) + 4 KPI (span 7, grid 2×2)**. Hero: etiqueta "Balance del mes", display `+868,31 €`, delta `▲ 142,19 €` en `income` con la referencia "frente a agosto (726,12 €)"; separador y tres micro-métricas (Ingresos 2.752,68 € en verde, Gastos 1.884,37 € en rojo, Movimientos 31). KPI: punto de color semántico + etiqueta, importe 600/24, "% sobre ingresos" en text-3, y **sparkline de 6 meses** (SVG 100×28, polyline 1,6–2px, sin relleno, en el color semántico de la tarjeta).
3. **Barra "Presupuesto consumido"**: pista de 10px `#1B1E24`, relleno al 68,5 % en `expense`, y **marca del día actual** = barra vertical de 2px `#F2F4F7` al 30 % (día 9 de 30), que sobresale 5px arriba y abajo. Pie: "Marca del día 9 de 30 — 30 % del mes transcurrido" y, a la derecha en rojo, "Vas 38,5 puntos por delante del ritmo".
4. **Gasto por semana (span 7)**: barras apiladas S1–S5, 4 segmentos por barra con la rampa del donut, ancho máx. 72px, esquinas redondeadas 6px solo en el conjunto (`overflow:hidden` sobre el stack), total de la semana encima en 13px y etiqueta S1–S5 debajo. Contenedor 215px de alto, leyenda de los 4 tipos en la cabecera de la tarjeta.
5. **Desglose por tipo de gasto (span 5)**: donut de 148px hecho con `conic-gradient` (`#F45B5B 0–47.4 %`, `#C24B4B →74.9 %`, `#8F3A3A →96.5 %`, `#5C2A2A →100 %`) y agujero de 96px del color de la tarjeta con el total dentro; a la derecha, lista de 4 filas con punto, nombre, importe y porcentaje alineado a la derecha. En Angular, el `conic-gradient` se calcula en un `computed` que devuelve el string y se enlaza con `[style.background]`.
6. **Próximos cargos (span 5)**: 5 filas con nombre, meta (`fecha · tipo`), importe coloreado y "en N días". Cabecera con el total "1.103,30 € en 30 días".
7. **Movimientos recientes (span 7)**: 6 filas (ver componente "Fila de movimiento"), enlace "Ver los 31" en acento.

**768**: cabecera compacta ("Sept. 2026"), hero a ancho completo con el delta a la derecha, KPI en 2×2, presupuesto, gasto por semana (barras de 56px), movimientos.
**390**: cabecera + hero apilados, KPI en 2×2 con sparkline a ancho completo, presupuesto, gasto por semana **con scroll horizontal** (columnas fijas de 64px), movimientos, FAB y tab bar.

**Datos de ejemplo**: ingresos 2.752,68 € (nómina 2.412,68 + clases 340,00); gastos 1.884,37 €; ahorro 400,00 €; inversión 250,00 €; balance +868,31 €. Semanas: 959,28 / 203,86 / 212,55 / 436,18 / 72,50. Tipos: fijo 893,80 (47,4 %), variable 517,99 (27,5 %), ocio 406,60 (21,6 %), suscripciones 65,98 (3,5 %).

> Estos números son la **fixture de referencia**: siémbralos en los tests del `AnalyticsService` y comprueba que el motor reproduce exactamente estos totales y porcentajes a partir de los movimientos.

### 2. Nuevo evento
**Propósito**: registrar un movimiento en el menor número de decisiones posible. Pantalla completa en escritorio, hoja a pantalla completa en móvil.

- **Selector de tipo**: segmented control de 6 opciones — Gasto, Ingreso, Suscripción, Domiciliación, Ahorro, Inversión. Contenedor `#131519` + borde, padding 4px, segmento activo `#6E56F8` con texto blanco, r8. En 768 se convierte en grid 3×2; en 390 en una fila de chips con scroll horizontal.
- **El formulario es adaptativo**: al cambiar el tipo cambian los campos visibles. Dos estados documentados:
  - **a) GASTO** (frame 1440): importe (input grande 72px, `€` en text-3 a la izquierda, cifra display 40/700, borde acento por estar enfocado) + fecha; **categoría** como chips seleccionables (Alimentación, Hogar, Transporte, Ocio, Salud, Formación, Viajes, Otros; activo = acento sólido); **naturaleza** (fijo / variable) como segmented pequeño; método de pago (select); concepto (input); notas (textarea 84px); columna derecha con **toggle "recurrente"** y **adjuntar recibo** (zona punteada + fichero ya adjunto con nombre, peso y ✕).
  - **b) INVERSIÓN** (frame 768): importe aportado (borde `investment`), fecha, activo/ticker (`IE00B4L5Y983 · MSCI World`), plataforma (Indexa Capital), **tipo de activo** como chips (Fondo indexado activo en `#38BDF8` con texto `#0A0B0D`, ETF, Acciones, Cripto, Plan de pensiones) y toggle "aportación periódica".
- **Bloque de frecuencia**: visible solo con "recurrente" activo — segmented Semanal / Mensual / Anual + "Fecha de fin · opcional".
- **Barra inferior fija**: `#131519`, borde superior 1px, padding `16px 32px`. Izquierda: atajo de texto en acento **"Guardar y añadir otro"**. Derecha: "Cancelar" (secundario) y "Guardar" (primario). En móvil la barra pasa a dos botones apilados de 48px y la cabecera lleva Cancelar / título / Guardar.
- **Toggle**: 44×26, r999, pista `#6E56F8` activa / `#262A31` inactiva, pastilla 20px blanca (activa) o `#6B7280` (inactiva), padding 3px.

**Cómo se implementa en Angular**: un **único componente contenedor** con un `signal<EventType>` y campos condicionados con `@switch` / `@if` — no seis formularios copiados ni seis rutas. El esquema de campos por tipo vive en un mapa de configuración del dominio, no en la plantilla. Formularios con **signal forms** si están estables en la versión instalada; si no, Reactive Forms tipados. El toggle y el segmented son componentes propios que implementan `ControlValueAccessor`.

### 3. Analítica
- **Barra de filtros pegajosa** (`#131519`, borde inferior, `padding:16px 32px`, sticky top): segmented de granularidad Día / Semana / Mes / Año; rango de fechas `01/04/2026 — 30/09/2026`; multiselección "Categorías" y "Tipos" como pills con contador en badge acento; enlace "Limpiar". A la derecha, botón **"Exportar ▾"** que despliega un menú de 212px (`#1B1E24`, r12, padding 6px) con Excel `.xlsx`, PDF `.pdf`, Word `.docx`; la opción con hover lleva fondo `#262A31`. El menú se ancla bajo el botón con `z-index:5`.
- **Fila de métricas** (5 tarjetas): total ingresos 15.342,80 € (verde), total gastos 11.209,19 € (rojo, "73,1 % de ingresos"), tasa de ahorro 26,9 % (ámbar, "objetivo 30 %"), gasto medio diario 61,37 €, varianza vs. media 3 meses `▼ 4,8 %` en verde con la lectura "gastas menos que tu media". **La flecha y el color codifican el signo**: ▼ + verde cuando gastar menos es bueno, ▲ + rojo en caso contrario.
- **Gráfico comparativo (span 7)**: barras agrupadas de 22px por mes (Abr–Sep) en el orden Ingresos / Gastos / Inversión con los colores semánticos, r4 arriba, y leyenda en la cabecera. Un **tooltip** visible como estado: caja de 196px `#1B1E24` + borde, título del mes y tres filas punto + etiqueta + importe tabular. Al portarlo a ECharts, el tooltip se construye con un `formatter` propio que reproduce exactamente esa caja; no vale el tooltip por defecto.
- **Gráfico de líneas (span 5)**: saldo acumulado en acento (2,5px) con **media móvil de 3 meses** superpuesta en `#6B7280` discontinua (`6 5`), 4 líneas de rejilla `#1B1E24`, eje de meses debajo y pie con "Saldo actual 9.418,44 €" y "Variación 6 m +4.133,61 €". En el prototipo el SVG se estira con `preserveAspectRatio:none` y usa `vector-effect:non-scaling-stroke`; en ECharts ese problema desaparece, pero conserva los grosores y el patrón de guiones tal cual.
- **Tabla de desglose por categoría**: columnas Categoría / Nº / Total (ordenada, `▾`) / % gasto / % ingresos / Media / Var. periodo; grid `2.2fr .7fr 1fr 1fr 1fr 1fr 1fr`, cabecera 13px text-3 con la columna ordenada en text-1, filas separadas por 1px `#1B1E24`, **mini barra de proporción de 4px** bajo el nombre de cada categoría (máx. 220px, relleno en `expense` al % del gasto), variación coloreada por signo, y **fila de totales** al pie. En 768 se reduce a 5 columnas; en 390 se convierte en **tarjetas apiladas** (nombre + total, barra, "N mov. · X % del gasto" y variación). La ordenación es un `computed` sobre el snapshot de analítica, no una mutación del array.
- **Modal de opciones de exportación** (480px, r12): título "Exportar a Excel", rango, tres toggles (incluir gráficas / incluir desglose por categoría / incluir movimientos en bruto — este último apagado, "183 filas") y botonera Cancelar / Exportar.

### 4. Análisis IA
- **Cabecera**: título + badge discreto **"Llama 3.1 · local"** (pill superficie elevada + borde) + **indicador de estado del modelo**: `Conectado` (pill verde con punto) o `No detectado` (pill roja). Párrafo explicando que el informe se genera en el propio ordenador y que ningún movimiento sale del fichero local. A la derecha "Ajustes del modelo" (secundario) y "Regenerar análisis" (primario).
- **Timeline vertical** (span 8): línea de 2px `#262A31` a la izquierda; cada tarjeta lleva un nodo de 12px (acento en la activa, `#262A31` en las demás) con anillo de 3px del color del fondo para recortar la línea.
  - **Tarjeta expandida** (la más reciente, borde acento): meta "Semana 36 · 1–7 sep 2026 · generado hace 2 h", **titular con el veredicto** en 600/24, **4 hallazgos con cifras concretas** (bloque `#1B1E24` con barra vertical de 6px en acento, título 15/500 y cuerpo 13/1.6) y bloque de **recomendaciones**, cada una con su **impacto estimado en euros al mes** en verde y un botón "Aplicar".
  - **Tarjetas colapsadas**: meta + resumen de una línea + "Expandir ▾".
  - **Estado de carga**: fila con spinner pulsante, "Generando informe de la semana 33…", "El modelo está leyendo 42 movimientos · 11 s" y barra de progreso de 6px al 62 %.
- **Columna derecha** (span 4): **"Potencial de ahorro detectado"** — importe display en verde `110,10 € /mes`, explicación ("equivale a 1.321,20 € al año") y desglose de las tres fuentes; debajo, tarjeta "Estado del modelo" (modelo, endpoint, último informe y duración).
- **Estado de error** (frame 768): pill roja "No detectado", tarjeta con borde `expense` — "No se encuentra Ollama en 127.0.0.1:11434", ayuda y botón "Reintentar"; los informes anteriores siguen visibles.

**Cómo se implementa en Angular**: `modelStatus` es un signal con estado discriminado y la plantilla lo resuelve con `@switch`, de forma que los cinco estados (no detectado, modelo sin descargar, generando, completado, fallido) sean exhaustivos y el compilador avise si falta uno. El streaming del modelo actualiza un signal de progreso; el texto parcial no se renderiza carácter a carácter en el DOM.

### 5. Calculadora
Panel deslizante lateral de **400px** en escritorio (el contenido de detrás permanece, atenuado al 45 % — no se pierde el contexto), hoja modal en móvil (con asa de 40×4px). Accesible desde cualquier pantalla.
- **Display**: caja `#1B1E24` r12, alineada a la derecha, con la operación en curso arriba en text-3 15px (`1.884,37 ÷ 30 =`) y el resultado abajo en display 40/700.
- **Teclado**: grid de 4 columnas, `gap:8px`, teclas de 56px (60px en móvil) r8. Dígitos y `,` sobre `#1B1E24` con texto primario; `C ± %` en text-2; **operadores `÷ × − +` en acento sobre `#6E56F81F`**; `=` en acento sólido; el `0` ocupa dos columnas. Glifo 500/24.
- **Pestaña secundaria "Financiera"**: chips de modo (% de un importe / dividir un gasto entre N personas / interés compuesto). Documentado el interés compuesto: capital inicial 4.200,00 €, aportación mensual 250,00 €, años 18, rentabilidad 6,8 % → resultado `122.847,36 €` en `investment`, con "Aportado 58.200,00 €" e "Intereses 64.647,36 €" en verde.
- **Historial**: últimas operaciones como filas reutilizables con un toque (operación en text-2, resultado en text-1 tabular) y enlace "Borrar".
- **Acción de cierre**: botón primario a ancho completo **"Usar 62,81 en nuevo evento"** en una barra inferior con borde superior.

**Cómo se implementa en Angular**: el panel **no puede ser una ruta**, porque desmontaría la vista de detrás. Vive en el layout raíz, controlado por un `CalculatorService` con un signal `isOpen`, y se abre con `Ctrl/Cmd+K` desde cualquier pantalla mediante un `HostListener` en el componente raíz. "Usar X en nuevo evento" navega a `/events/new` pasando el importe por estado de router o por el servicio, nunca por query param formateado.

### 6. Ajustes
Dos columnas (7 / 5) en escritorio, una en 768 y 390.
- **Fichero de datos**: ruta local en tipografía tabular dentro de una caja + enlace "Cambiar"; tamaño (2,41 MB), nº de movimientos (1.847), última copia (8 sep, 23:14); botones **"Crear copia de seguridad"** (primario) y **"Restaurar desde archivo"** (secundario).
- **Ollama**: pill de estado con latencia ("Conectado · 240 ms"), select de modelo (`llama3.1:8b-instruct`), endpoint (`http://127.0.0.1:11434`) y botón **"Probar conexión"**.
- **Categorías**: lista editable, cada fila con **muestra de color** de 28px (fondo del color al 12 %, borde del color a plena opacidad), nombre, nº de movimientos y "Editar"; enlace "+ Añadir categoría".
- **Ingresos recurrentes**: filas con nombre, periodicidad e importe en verde; "+ Añadir ingreso recurrente".
- **Presupuesto mensual objetivo**: input grande (56px, 600/24) con 1.750,00 € y la lectura derivada ("sobre unos ingresos medios de 2.557,13 €, deja una tasa de ahorro objetivo del 31,6 %").
- **Moneda y formato**: select de moneda (Euro · 1.234,56 €) y segmented de formato de fecha (DD/MM/AAAA / AAAA-MM-DD).

---

## Rutas Angular

| Ruta | Pantalla | Notas |
|---|---|---|
| `/dashboard` | Dashboard (mes en curso) | Ruta por defecto (`redirectTo`) |
| `/events` | Listado y edición de movimientos | Destino "Movim." de la tab bar |
| `/events/new` | Nuevo evento | Pantalla completa; hoja completa en móvil |
| `/events/:id` | Edición de un movimiento | Reutiliza el contenedor de `/events/new` |
| `/analytics` | Analítica | Filtros serializados en query params para poder volver |
| `/ai` | Análisis IA | — |
| `/settings` | Ajustes | — |

Todas con **lazy loading** (`loadComponent`). La calculadora **no tiene ruta**: es un panel del layout raíz.

---

## Components & States
Cada componente está dibujado en la hoja de componentes del prototipo (sección 7) en: **normal, hover, activo, foco, deshabilitado y error**. La columna "Componente Angular" fija el nombre esperado en el código: respétalo para que el handoff y el repositorio hablen el mismo idioma.

| Componente | Componente Angular | Notas de estado |
|---|---|---|
| **Fila de movimiento** | `MovementRowComponent` | Normal: sin fondo ni borde. Hover: `#1B1E24` + borde `#262A31`, meta sube a text-2. Activo: `#6E56F814` + borde acento. Foco: `#1B1E24` + borde acento. Deshabilitada: `opacity .4`. Error: `#F45B5B14` + borde `expense` y meta en rojo ("Importe duplicado con el 7 sep"). Estructura: avatar de 32px (iniciales, fondo del color semántico al 12 %), concepto 15/500, meta 13/400, importe tabular a la derecha coloreado por tipo. |
| **Tarjeta KPI con sparkline** | `KpiCardComponent` + `SparklineComponent` | Normal / hover (`#1B1E24` + borde `#2F343D`) / activo (borde acento, pie "Filtrando por gastos") / foco (borde acento) / deshabilitada (`opacity .4`, "Sin datos del periodo") / error (borde `expense`, pie rojo "Faltan 3 movimientos por clasificar"). El sparkline es SVG propio, no ECharts. |
| **Chip de categoría** | `CategoryChipComponent` | Normal `#1B1E24`+borde / hover `#262A31` / activo acento sólido + texto blanco / foco borde acento + anillo `0 0 0 3px #6E56F833` / deshabilitado `opacity .45` con nota "sin movimientos" / error borde y texto `expense` con nota "categoría eliminada". Altura 32px (36px móvil), r999. |
| **Segmented control** | `SegmentedControlComponent` | Pista `#1B1E24` + borde, padding 3px, gap 3px, segmento activo acento r6. Hover sobre inactivo: `#262A31` + texto primario. Foco: borde acento + anillo. Opción deshabilitada: texto `#4B5563`. Implementa `ControlValueAccessor`; genérico en el tipo del valor. |
| **Input de importe** | `MoneyInputComponent` | Normal (valor `0,00` en text-3) / foco (borde acento + anillo, valor primario) / relleno con 5 dígitos (`12.480,55` — comprobar que no rompe) / deshabilitado (`opacity .45`) / error (borde `expense` + mensaje "El importe tiene que ser mayor que cero."). Símbolo `€` siempre a la izquierda en 600/24 text-3, cifra en 700/40 tabular. Emite **céntimos enteros**, nunca un `number` decimal. |
| **Badge de tipo** | `TypeBadgeComponent` | Ingreso, Gasto, Inversión, Ahorro, Suscripción (acento) y Domiciliación (neutro con borde). 26px, r999, fondo al 12 % del color, texto al 100 %. |
| **Tarjeta de informe IA** | `AiReportCardComponent` | Expandida (borde acento), colapsada, cargando (spinner + "El modelo está pensando…") y error (borde `expense` + "Reintentar"). |
| **Estado vacío ilustrado** | `EmptyStateComponent` | Caja punteada `#262A31` sobre `#1B1E24`: pequeño gráfico de 4 barras (la tercera en acento) construido con divs, titular 15/500, explicación 13/1.6 y CTA. Segunda variante para "ningún resultado con estos filtros" con enlace "Limpiar filtros". |
| **Skeleton de carga** | `SkeletonComponent` | Bloques r999 con `linear-gradient(90deg,#1B1E24 25%,#262A31 50%,#1B1E24 75%)`, `background-size:200% 100%` y `animation: shim 1.6s linear infinite` (`@keyframes shim { 0% {background-position:-200% 0} 100% {background-position:200% 0} }`). Filas de avatar + dos líneas de anchos variables + importe. |
| **Toggle** | `ToggleComponent` | 44×26 según la especificación de "Nuevo evento". `ControlValueAccessor`, `role="switch"` y `aria-checked`. |
| **Gráfico** | directiva `[chart]` | Envuelve ECharts: recibe la opción como signal (`input.required<EChartsOption>()`), llama a `setOption`, se redimensiona con `ResizeObserver` y destruye la instancia en `ngOnDestroy`. |

Todos los componentes de esta tabla son **presentacionales**: reciben `input()` y emiten `output()`, sin inyectar facades ni servicios de datos. La composición y el acceso a estado ocurren en los componentes de pantalla.

---

## Interactions & Behavior
- **Selector de mes**: `‹` / `›` desplazan el mes; todo el dashboard (hero, KPI, presupuesto, gráficos, listas) se recalcula. La pill "Hoy · 9 sep" vuelve al mes en curso. En Angular esto es un solo signal `currentMonth`; el resto son `computed` que se reevalúan solos.
- **Nuevo evento**: cambiar el tipo en el segmented **cambia el conjunto de campos visibles** (mismo contenedor, sin navegación). Activar "recurrente" / "aportación periódica" revela el bloque de frecuencia. "Guardar y añadir otro" guarda y reinicia el formulario conservando tipo y fecha. Atajo `Ctrl/Cmd+Enter` para guardar.
- **Filtros de analítica**: la barra queda pegajosa al hacer scroll; cambiar granularidad, rango, categorías o tipos recalcula métricas, ambos gráficos y la tabla. La tabla es **ordenable** por cualquier columna (indicador `▾` en la activa).
- **Exportar**: el botón abre el menú de formatos; elegir uno abre el modal de opciones; "Exportar" escribe el fichero mediante el **diálogo nativo de Tauri** (`@tauri-apps/plugin-dialog`), con nombre por defecto `fintrack-YYYY-MM.{ext}`.
- **Calculadora**: se abre desde cualquier pantalla sin perder el contexto (panel lateral en escritorio, hoja modal en móvil), con `Ctrl/Cmd+K`. Cada entrada del historial se reutiliza con un toque. "Usar X en nuevo evento" abre el formulario con el importe precargado.
- **Análisis IA**: "Regenerar análisis" lanza el modelo local y muestra el estado de carga con progreso; si Ollama no responde en 30 s, la tarjeta pasa a error con "Reintentar" y se conservan los informes anteriores. Las tarjetas de la timeline expanden/colapsan; solo la más reciente empieza expandida.
- **Ajustes**: "Probar conexión" muestra latencia o error en la pill de estado. "Restaurar desde archivo" debe pedir confirmación (sobrescribe el fichero actual).
- **Estados de carga**: usar el skeleton de fila para listas y una versión del mismo barrido para tarjetas y gráficos.
- **Animación**: solo dos — el barrido del skeleton (`shim`, 1.6s lineal infinito) y el pulso del spinner del modelo (`pulse`, 1.4s ease-in-out infinito, opacidad .35→1). Nada más se mueve. No uses el módulo de animaciones de Angular: ambas son CSS puro.
- **Accesibilidad**: navegación completa por teclado, `:focus-visible` con el anillo de acento, `aria-label` en los botones de solo icono (flechas de mes, teclas, iconos de la sidebar colapsada) y contraste AA sobre el fondo oscuro. Si algún par de colores no llega a AA, repórtalo en vez de cambiarlo por tu cuenta.
- **Responsive**: ver la sección "Layout responsive". Los gráficos que no caben en móvil llevan scroll horizontal, nunca se comprimen por debajo de la legibilidad.

## State Management
El prototipo describe el estado en términos genéricos; en Angular se materializa así:

- Todo el estado vive en **signals** dentro de facades inyectables (`providedIn: 'root'` o a nivel de ruta). Los componentes **nunca** hablan con SQL: `componente → facade → servicio de dominio → repositorio → SQLite`.
- **Nada derivable se almacena.** Si sale de `movements()`, es un `computed`.

| Estado del prototipo | En Angular |
|---|---|
| `currentMonth`, `today` | `signal<YearMonth>` y `signal<IsoDate>` en `DashboardFacade` |
| `movements[]` — origen único de verdad | `signal<Movement[]>` en `MovementsFacade`; KPI, semanas, donut, próximos cargos, tabla de categorías y series de 6 meses son `computed` derivados |
| `recurringRules[]` | `signal<RecurrenceRule[]>`; los "Próximos cargos" son un `computed` sobre `RecurrenceService.expand(...)`, proyectados bajo demanda y **no materializados en el futuro** |
| `eventDraft` | Estado del formulario en `EventFormComponent`: tipo activo + campos visibles + validación (importe > 0, categoría obligatoria en gasto, ticker obligatorio en inversión) |
| `analyticsFilters` | `signal<AnalyticsFilters>` (`{ granularity, dateRange, categories[], types[], sortColumn, sortDir }`), sincronizado con query params |
| `exportOptions` | Estado local del modal (`{ format, range, includeCharts, includeBreakdown, includeRawMovements }`) |
| `aiReports[]`, `modelStatus` | `signal<AiReport[]>` y `signal<ModelStatus>` con estado discriminado (`connected \| not_detected \| generating \| error`) + progreso y tiempo transcurrido |
| `calculator` | `CalculatorService` con `{ isOpen, tab, expression, result, history[], financialInputs }` |
| `settings` | `SettingsFacade` sobre la tabla `settings`: ruta del fichero, último backup, config de Ollama, categorías, presupuesto objetivo, moneda, formato de fecha |

**Sin capa de red**: toda la persistencia es lectura/escritura del fichero local `fintrack.db` (SQLite). La única llamada externa es a `127.0.0.1:11434` (Ollama). La app debe funcionar entera con el wifi apagado, exportación incluida.

**Dinero y fechas**: los importes son enteros en céntimos (`Money`, branded type) y las fechas texto ISO `YYYY-MM-DD`. Ningún `number` decimal ni `Date` cruza la capa de datos. El formateo `es-ES` (1.234,56 €, semana empezando en lunes, semanas ISO 8601) ocurre solo en la vista, mediante pipes.

## Assets
Ninguna imagen ni fuente propia. Los iconos de navegación y de la tab bar son SVG geométricos de 18px, trazo `1.6` `currentColor`, `stroke-linecap:round` (cuadrícula 2×2, tres líneas, tres barras, círculos concéntricos, engranaje simplificado). Sin emoji. Impleméntalos como un componente `IconComponent` con `input` de nombre y un `@switch`, o como sprite SVG inline; nada de librerías de iconos.

La única fuente es **Inter** (pesos 400/500/600/700). Como la app es offline, **no se carga desde Google Fonts**: empaquétala como fichero local (`woff2`, `font-display: block`) en los assets del proyecto.

## Files
- `Fintrack.dc.html` — todas las pantallas en 1440 / 768 / 390, fundamentos (paleta + escala tipográfica) y hoja de componentes. Los datos de ejemplo están en la clase `Component` al final del fichero: úsalos como fixture de tests, no los copies a la plantilla.
- `Sidebar.dc.html` — barra de navegación, con prop `active` (destino seleccionado) y `collapsed` (modo icono de 64px). En Angular: `SidebarComponent` con `input()` para `collapsed` y estado activo derivado de `RouterLink` / `routerLinkActive`.
- `support.js` — runtime del prototipo. **No portar**; solo permite abrir los `.dc.html` en el navegador.

Ábrelos con cualquier navegador (mismo directorio) para ver el diseño en vivo antes de implementar.