import { DestroyRef, Injectable, inject, signal } from '@angular/core';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Preferencia de movimiento reducido del sistema, como signal. El CSS ya se
 * apaga solo (`_animations.scss`); esto es para lo que se anima desde código
 * (cifras que cuentan, gráficos de ECharts).
 */
@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly reducedSig = signal(false);
  readonly reduced = this.reducedSig.asReadonly();

  constructor() {
    if (typeof matchMedia !== 'function') return;
    const mql = matchMedia(QUERY);
    this.reducedSig.set(mql.matches);
    const onChange = (e: MediaQueryListEvent) => this.reducedSig.set(e.matches);
    mql.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => mql.removeEventListener('change', onChange));
  }
}
