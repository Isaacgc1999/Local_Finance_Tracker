/**
 * Espejo en TypeScript de los tokens de color de `src/styles/_tokens.scss`
 * para ECharts (que no lee custom properties) y para los exportadores.
 * Si cambia un token, cambia aquí también.
 */
export const FT_COLORS = {
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
  /** Rampa del donut de tipos de gasto (fijo, variable, ocio, suscripciones). */
  expenseRamp: ['#F45B5B', '#C24B4B', '#8F3A3A', '#5C2A2A'] as const,
} as const;

export const FT_FONT = "'Inter', system-ui, sans-serif";

/** Tooltip de gráfico del handoff: caja 196px `#1B1E24` + borde, título 13/500 y filas punto + etiqueta + importe. */
export const FT_TOOLTIP = {
  backgroundColor: FT_COLORS.surfaceElevated,
  borderColor: FT_COLORS.border,
  borderWidth: 1,
  borderRadius: 8,
  padding: [12, 14] as [number, number],
  textStyle: { color: FT_COLORS.text1, fontFamily: FT_FONT, fontSize: 13 },
  extraCssText: 'width:196px;box-shadow:none;',
} as const;

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
