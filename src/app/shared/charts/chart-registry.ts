import type { ECharts } from './echarts';
import { FT_COLORS } from './palette';

/**
 * Registro de gráficos vivos, por nombre. La directiva `[chart]` da de alta
 * su instancia y la exportación recupera el PNG sin acoplar la pantalla con
 * el dominio de exportación.
 */
const charts = new Map<string, ECharts>();

export function registerChart(id: string, instance: ECharts): () => void {
  charts.set(id, instance);
  return () => {
    if (charts.get(id) === instance) charts.delete(id);
  };
}

export function hasChart(id: string): boolean {
  return charts.has(id);
}

export interface ChartPng {
  readonly dataUrl: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Escala de rasterizado: el handoff pide los gráficos exportados a 2x. */
const PIXEL_RATIO = 2;

/**
 * PNG del gráfico a 2x sobre el fondo de tarjeta de la app, para incrustarlo
 * en PDF y Word con la misma paleta semántica que en pantalla.
 *
 * Los gráficos se dibujan con el renderer SVG (más nítido y ligero), y ese
 * renderer no sabe rasterizar: se serializa el SVG y se pinta en un canvas
 * del doble de tamaño. Sin dependencias añadidas.
 */
export async function chartToPng(id: string, background: string = FT_COLORS.surface): Promise<ChartPng | null> {
  const instance = charts.get(id);
  if (!instance) return null;

  // Un gráfico con scroll horizontal mide varias veces el ancho de su tarjeta
  // (medio año por días, decenas de miles de px): en el documento quedaría
  // una tira ilegible. Se dibuja el rango entero en el ancho visible y se
  // devuelve el gráfico a su tamaño.
  const fullWidth = instance.getWidth();
  const viewport = instance.getDom().parentElement?.clientWidth ?? 0;
  const narrowed = viewport > 0 && viewport < fullWidth;
  let svg: string | null;
  let width: number;
  let height: number;
  try {
    if (narrowed) instance.resize({ width: viewport });
    width = instance.getWidth();
    height = instance.getHeight();
    svg = svgStringOf(instance);
  } finally {
    if (narrowed) instance.resize();
  }
  if (!width || !height || !svg) return null;

  try {
    const image = await loadSvg(svg);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * PIXEL_RATIO);
    canvas.height = Math.round(height * PIXEL_RATIO);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/png'), widthPx: canvas.width, heightPx: canvas.height };
  } catch {
    return null;
  }
}

interface SvgCapable {
  renderToSVGString?: () => string;
}

function svgStringOf(instance: ECharts): string | null {
  const capable = instance as unknown as SvgCapable;
  if (typeof capable.renderToSVGString === 'function') return capable.renderToSVGString();
  // Renderer canvas: el data URL ya es un PNG utilizable tal cual.
  return null;
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo rasterizar el gráfico'));
    };
    image.src = url;
  });
}

/** Identificadores estables de los gráficos exportables. */
export const CHART_IDS = {
  comparativa: 'analytics-comparativa',
  saldo: 'analytics-saldo',
  semana: 'dashboard-semana',
  donut: 'dashboard-donut',
} as const;

/** Fondo de los gráficos exportados: la superficie de tarjeta de la app. */
export const CHART_EXPORT_BG = FT_COLORS.surface;
