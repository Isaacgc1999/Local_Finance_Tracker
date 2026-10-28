import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

import {
  APPEARANCE_STORAGE_KEY,
  type AppStyle,
  type Appearance,
  DEFAULT_APPEARANCE,
  type ResolvedMode,
  type ThemeMode,
  accentHover,
  normalizeHex,
  onAccent,
  parseAppearance,
} from '../../core/types/appearance';
import { type ChartPalette, FT_PRINT_COLORS, setChartPalette } from '../../shared/charts/palette';
import { MotionService } from './motion.service';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  return typeof matchMedia !== 'function' || matchMedia(DARK_QUERY).matches;
}

export function resolveMode(mode: ThemeMode, prefersDark: boolean): ResolvedMode {
  if (mode === 'sistema') return prefersDark ? 'oscuro' : 'claro';
  return mode;
}

export function readStoredAppearance(): Appearance {
  try {
    return parseAppearance(globalThis.localStorage?.getItem(APPEARANCE_STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/**
 * Escribe la apariencia en <html>: `data-modo`, `data-estilo` y, si hay acento
 * propio, `--ft-accent` con su hover y su color de texto. El resto lo hace el
 * CSS (`_themes.scss`). También actualiza `<meta name="theme-color">`.
 */
export function applyAppearance(
  appearance: Appearance,
  prefersDark = systemPrefersDark(),
): ResolvedMode {
  const mode = resolveMode(appearance.mode, prefersDark);
  if (typeof document === 'undefined') return mode;
  const root = document.documentElement;
  root.dataset['modo'] = mode;
  root.dataset['estilo'] = appearance.style;

  const accent = normalizeHex(appearance.accent);
  if (accent) {
    root.style.setProperty('--ft-accent', accent);
    root.style.setProperty('--ft-accent-hover', accentHover(accent, mode));
    root.style.setProperty('--ft-on-accent', onAccent(accent));
  } else {
    root.style.removeProperty('--ft-accent');
    root.style.removeProperty('--ft-accent-hover');
    root.style.removeProperty('--ft-on-accent');
  }

  const bg = getComputedStyle(root).getPropertyValue('--ft-bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  return mode;
}

/** Colores ya resueltos del tema aplicado, para ECharts. */
export function readChartPalette(): ChartPalette {
  if (typeof document === 'undefined') return FT_PRINT_COLORS;
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const p = FT_PRINT_COLORS;
  return {
    bg: read('--ft-bg', p.bg),
    surface: read('--ft-surface', p.surface),
    surfaceElevated: read('--ft-surface-elevated', p.surfaceElevated),
    border: read('--ft-border', p.border),
    text1: read('--ft-text-1', p.text1),
    text2: read('--ft-text-2', p.text2),
    text3: read('--ft-text-3', p.text3),
    accent: read('--ft-accent', p.accent),
    income: read('--ft-income', p.income),
    expense: read('--ft-expense', p.expense),
    investment: read('--ft-investment', p.investment),
    savings: read('--ft-savings', p.savings),
    subscription: read('--ft-subscription', p.subscription),
    directDebit: read('--ft-direct-debit', p.directDebit),
    series: [
      read('--ft-investment', p.investment),
      read('--ft-subscription', p.subscription),
      read('--ft-income', p.income),
      read('--ft-savings', p.savings),
      read('--ft-direct-debit', p.directDebit),
      read('--ft-series-pink', '#F472B6'),
      read('--ft-series-teal', '#2DD4BF'),
      read('--ft-accent', p.accent),
    ],
    expenseRamp: [
      read('--ft-expense-ramp-1', p.expenseRamp[0]),
      read('--ft-expense-ramp-2', p.expenseRamp[1]),
      read('--ft-expense-ramp-3', p.expenseRamp[2]),
      read('--ft-expense-ramp-4', p.expenseRamp[3]),
    ],
    font: read('--ft-font-family', p.font),
  };
}

/**
 * Apariencia como signals. `main.ts` ya la aplicó antes de arrancar Angular
 * (sin parpadeo); este servicio la mantiene: guarda cada cambio, sigue al
 * sistema en modo «Sistema» y publica la paleta de los gráficos.
 *
 * El cambio de tema se funde con una View Transition cuando el navegador la
 * tiene y el movimiento no está reducido; si no, es instantáneo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly motion = inject(MotionService);
  private readonly appearanceSig = signal<Appearance>(readStoredAppearance());
  private readonly prefersDarkSig = signal(systemPrefersDark());

  readonly appearance = this.appearanceSig.asReadonly();
  readonly mode = computed(() => this.appearanceSig().mode);
  readonly style = computed(() => this.appearanceSig().style);
  readonly accent = computed(() => this.appearanceSig().accent);
  readonly resolvedMode = computed(() =>
    resolveMode(this.appearanceSig().mode, this.prefersDarkSig()),
  );

  constructor() {
    if (typeof matchMedia === 'function') {
      const mql = matchMedia(DARK_QUERY);
      const onChange = (e: MediaQueryListEvent) => this.prefersDarkSig.set(e.matches);
      mql.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => mql.removeEventListener('change', onChange));
    }

    let first = true;
    effect(() => {
      const appearance = this.appearanceSig();
      const prefersDark = this.prefersDarkSig();
      const apply = () => {
        applyAppearance(appearance, prefersDark);
        setChartPalette(readChartPalette());
      };
      if (first) {
        first = false;
        apply();
        return;
      }
      this.withTransition(apply);
    });
  }

  setMode(mode: ThemeMode): void {
    this.update({ mode });
  }

  setStyle(style: AppStyle): void {
    this.update({ style });
  }

  /** null vuelve al acento del estilo. */
  setAccent(accent: string | null): void {
    this.update({ accent: accent === null ? null : normalizeHex(accent) });
  }

  reset(): void {
    this.appearanceSig.set(DEFAULT_APPEARANCE);
    this.persist(DEFAULT_APPEARANCE);
  }

  private update(patch: Partial<Appearance>): void {
    const next = { ...this.appearanceSig(), ...patch };
    this.appearanceSig.set(next);
    this.persist(next);
  }

  private persist(appearance: Appearance): void {
    try {
      globalThis.localStorage?.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      // Sin almacenamiento (modo privado del navegador de la demo): el tema
      // dura lo que la sesión.
    }
  }

  private withTransition(apply: () => void): void {
    const doc = typeof document === 'undefined' ? null : document;
    if (!doc || this.motion.reduced() || typeof doc.startViewTransition !== 'function') {
      apply();
      return;
    }
    const root = doc.documentElement;
    root.classList.add('ft-cambio-tema');
    const transition = doc.startViewTransition(apply);
    void transition.finished.finally(() => root.classList.remove('ft-cambio-tema'));
  }
}
