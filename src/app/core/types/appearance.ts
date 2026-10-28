/**
 * Apariencia de la app (Ajustes → Apariencia). Es una preferencia del equipo,
 * no de los datos: se guarda en el almacenamiento local del webview y no en la
 * base de datos, para poder aplicarla antes de abrirla y que la app no
 * arranque un instante con el tema equivocado. Una copia de seguridad del
 * fichero de datos, por tanto, no se lleva el tema.
 *
 * Los valores de `ThemeMode` y `AppStyle` son los que `ThemeService` escribe en
 * `data-modo` / `data-estilo` de <html> (ver `src/styles/_themes.scss`).
 */
export type ThemeMode = 'oscuro' | 'claro' | 'sistema';
export type ResolvedMode = Exclude<ThemeMode, 'sistema'>;
export type AppStyle = 'finance' | 'cozy' | 'minimal' | 'gamer';

export interface Appearance {
  readonly mode: ThemeMode;
  readonly style: AppStyle;
  /** Color de acento en `#rrggbb`, o null para usar el del estilo. */
  readonly accent: string | null;
}

export const DEFAULT_APPEARANCE: Appearance = { mode: 'oscuro', style: 'finance', accent: null };

export const APPEARANCE_STORAGE_KEY = 'fintrack.apariencia';

export const THEME_MODES: readonly ThemeMode[] = ['oscuro', 'claro', 'sistema'];
export const APP_STYLES: readonly AppStyle[] = ['finance', 'cozy', 'minimal', 'gamer'];

export const STYLE_LABEL: Readonly<Record<AppStyle, string>> = {
  finance: 'Finance',
  cozy: 'Cozy',
  minimal: 'Minimalista',
  gamer: 'Gamer',
};

export const STYLE_HINT: Readonly<Record<AppStyle, string>> = {
  finance: 'El de siempre: sobrio y claro',
  cozy: 'Rosa, cálido y redondeado',
  minimal: 'Monocromo, plano, sin adornos',
  gamer: 'Neón, esquinas vivas y monoespaciada',
};

/** Acentos sugeridos. El primero es el morado original del handoff. */
export const ACCENT_PRESETS: readonly { readonly name: string; readonly hex: string }[] = [
  { name: 'Morado', hex: '#6e56f8' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Cian', hex: '#06b6d4' },
  { name: 'Verde', hex: '#10b981' },
  { name: 'Ámbar', hex: '#f59e0b' },
  { name: 'Naranja', hex: '#f97316' },
  { name: 'Rojo', hex: '#ef4444' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Grafito', hex: '#64748b' },
];

const HEX = /^#[0-9a-f]{6}$/;

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return HEX.test(v) ? v : null;
}

/**
 * Lee lo guardado sin fiarse de ello: cualquier campo raro vuelve a su valor
 * por defecto en vez de dejar la app sin tema.
 */
export function parseAppearance(raw: string | null): Appearance {
  if (!raw) return DEFAULT_APPEARANCE;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_APPEARANCE;
  }
  if (typeof data !== 'object' || data === null) return DEFAULT_APPEARANCE;
  const o = data as Record<string, unknown>;
  return {
    mode: THEME_MODES.includes(o['mode'] as ThemeMode)
      ? (o['mode'] as ThemeMode)
      : DEFAULT_APPEARANCE.mode,
    style: APP_STYLES.includes(o['style'] as AppStyle)
      ? (o['style'] as AppStyle)
      : DEFAULT_APPEARANCE.style,
    accent: normalizeHex(o['accent']),
  };
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminancia relativa WCAG 2.x. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const ON_LIGHT = '#0a0b0d';
const ON_DARK = '#ffffff';

/** Texto sobre un botón de ese acento: blanco o casi negro, el que más contraste. */
export function onAccent(accent: string): string {
  return contrastRatio(accent, ON_DARK) >= contrastRatio(accent, ON_LIGHT) ? ON_DARK : ON_LIGHT;
}

/** Mezcla `amount` (0–1) de `toward` sobre `hex`, en sRGB. */
export function mixHex(hex: string, toward: string, amount: number): string {
  const a = channels(hex);
  const b = channels(toward);
  return (
    '#' +
    a
      .map((c, i) => Math.round(c + ((b[i] ?? c) - c) * amount))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Hover del acento: más claro en oscuro, más oscuro en claro (como los de serie). */
export function accentHover(accent: string, mode: ResolvedMode): string {
  return mode === 'oscuro' ? mixHex(accent, '#ffffff', 0.22) : mixHex(accent, '#000000', 0.16);
}
