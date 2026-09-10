import { Injectable, computed, signal } from '@angular/core';

/** Rangos del handoff: hasta 640 móvil, 641 a 1023 tablet, desde 1024 escritorio. */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export const MOBILE_MAX = 640;
export const DESKTOP_MIN = 1024;

export function breakpointFor(width: number): Breakpoint {
  if (width <= MOBILE_MAX) return 'mobile';
  if (width < DESKTOP_MIN) return 'tablet';
  return 'desktop';
}

/**
 * Ancho del shell observado con ResizeObserver (nunca con listeners de window).
 * El Shell llama a `observe()` con su elemento raíz una sola vez.
 */
@Injectable({ providedIn: 'root' })
export class BreakpointService {
  private readonly width = signal<number>(DESKTOP_MIN);

  readonly current = computed<Breakpoint>(() => breakpointFor(this.width()));
  readonly isMobile = computed(() => this.current() === 'mobile');
  readonly isTablet = computed(() => this.current() === 'tablet');
  readonly isDesktop = computed(() => this.current() === 'desktop');

  /** Devuelve la función para dejar de observar. */
  observe(element: Element): () => void {
    if (typeof ResizeObserver === 'undefined') {
      this.width.set(element.clientWidth || DESKTOP_MIN);
      return () => undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) this.width.set(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }

  /** Solo para tests y herramientas: fija el ancho a mano. */
  setWidth(width: number): void {
    this.width.set(width);
  }
}
