import { signal } from '@angular/core';

/**
 * Colores de los tokens de `src/styles/_tokens.scss` / `_themes.scss` para
 * ECharts, que no lee custom properties.
 *
 * Desde que hay temas (2026-10-28) no son constantes: `ThemeService` los lee
 * del CSS ya aplicado y los publica con `setChartPalette`. Cada propiedad de
 * `FT_COLORS` lee una signal, así que un `computed` que monta la opción de un
 * gráfico se recalcula solo al cambiar de tema o de acento.
 *
 * `FT_PRINT_COLORS` son los de finance oscuro, fijos: los exportadores (PDF,
 * Word) imprimen sobre papel blanco y no deben heredar un acento neón o blanco.
 */
export interface ChartPalette {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceElevated: string;
  readonly border: string;
  readonly text1: string;
  readonly text2: string;
  readonly text3: string;
  readonly accent: string;
  readonly income: string;
  readonly expense: string;
  readonly investment: string;
  readonly savings: string;
  readonly subscription: string;
  readonly directDebit: string;
  /** Colores para series de varias huchas o inversiones, en orden. */
  readonly series: readonly string[];
  readonly subscription: string;
  readonly directDebit: string;
  /** Colores para series de varias huchas o inversiones, en orden. */
  readonly series: readonly string[];
  /** Rampa del donut de tipos de gasto (fijo, variable, ocio, suscripciones). */
  readonly expenseRamp: readonly [string, string, string, string];
  readonly font: string;
}

export const FT_PRINT_COLORS: ChartPalette = {
  bg: '#0A0B0D',
  surface: '#131519',
  surfaceElevated: '#1B1E24',
  border: '#262A31',
  text1: '#F2F4F7',
  text2: '#9BA3AF',
  text3: '#6B7280',
  accent: '#6E56F8',
  income: '#22C55E',
  expense: '#F45B5B',
  investment: '#38BDF8',
  savings: '#FBBF24',
  subscription: '#A78BFA',
  directDebit: '#FB923C',
  series: ['#38BDF8', '#A78BFA', '#22C55E', '#FBBF24', '#FB923C', '#F472B6', '#2DD4BF', '#6E56F8'],
  expenseRamp: ['#F45B5B', '#C24B4B', '#8F3A3A', '#5C2A2A'],
  font: "'Inter', system-ui, sans-serif",
};

const paletteSig = signal<ChartPalette>(FT_PRINT_COLORS);

export function setChartPalette(palette: ChartPalette): void {
  paletteSig.set(palette);
}

/** Paleta del tema activo. Leerla dentro de un `computed` lo suscribe al tema. */
export const FT_COLORS: Omit<ChartPalette, 'font'> = {
  get bg() {
    return paletteSig().bg;
  },
  get surface() {
    return paletteSig().surface;
  },
  get surfaceElevated() {
    return paletteSig().surfaceElevated;
  },
  get border() {
    return paletteSig().border;
  },
  get text1() {
    return paletteSig().text1;
  },
  get text2() {
    return paletteSig().text2;
  },
  get text3() {
    return paletteSig().text3;
  },
  get accent() {
    return paletteSig().accent;
  },
  get income() {
    return paletteSig().income;
  },
  get expense() {
    return paletteSig().expense;
  },
  get investment() {
    return paletteSig().investment;
  },
  get savings() {
    return paletteSig().savings;
  },
  get subscription() {
    return paletteSig().subscription;
  },
  get directDebit() {
    return paletteSig().directDebit;
  },
  get series() {
    return paletteSig().series;
  },
  get subscription() {
    return paletteSig().subscription;
  },
  get directDebit() {
    return paletteSig().directDebit;
  },
  get series() {
    return paletteSig().series;
  },
  get expenseRamp() {
    return paletteSig().expenseRamp;
  },
};

/** Familia de los textos de los gráficos (la del cuerpo del tema activo). */
export function chartFont(): string {
  return paletteSig().font;
}

/** Tooltip de gráfico del handoff: caja 196px `#1B1E24` + borde, título 13/500 y filas punto + etiqueta + importe. */
export const FT_TOOLTIP = {
  get backgroundColor() {
    return FT_COLORS.surfaceElevated;
  },
  get borderColor() {
    return FT_COLORS.border;
  },
  borderWidth: 1,
  borderRadius: 8,
  padding: [12, 14] as [number, number],
  get textStyle() {
    return { color: FT_COLORS.text1, fontFamily: chartFont(), fontSize: 13 };
  },
  extraCssText: 'width:196px;box-shadow:none;',
};

export function tooltipRow(color: string, label: string, value: string): string {
  return `<div style="display:flex;align-items:center;gap:8px;margin-top:7px">
    <span style="width:6px;height:6px;border-radius:999px;background:${color};flex:none"></span>
    <span style="flex:1;color:${FT_COLORS.text2};font-size:13px">${label}</span>
    <span style="font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:-0.01em">${value}</span>
  </div>`;
}

export function tooltipTitle(text: string): string {
  return `<div style="font-weight:500;font-size:13px;color:${FT_COLORS.text1};margin-bottom:3px">${text}</div>`;
}
