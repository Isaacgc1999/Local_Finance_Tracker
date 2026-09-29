import { DestroyRef, type Signal, effect, inject, signal, untracked } from '@angular/core';

import { MotionService } from '../../infra/platform/motion.service';

export interface TweenOptions {
  /** Duración de cada transición. */
  readonly durationMs?: number;
  /** Valor desde el que arranca la primera vez; por defecto, el propio destino (sin animar). */
  readonly from?: number;
}

/** Curva «ease-out cubic»: rápida al principio y se posa al final. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Signal que sigue a `source` interpolando con requestAnimationFrame, para
 * que una cifra «cuente» hasta su nuevo valor. Sin zone.js, cada `set` marca
 * solo la vista que la lee. Con movimiento reducido (o sin rAF, en tests)
 * salta al destino. Debe crearse en un contexto de inyección.
 */
export function tweened(source: () => number, options: TweenOptions = {}): Signal<number> {
  const motion = inject(MotionService);
  const duration = options.durationMs ?? 520;
  const out = signal(options.from ?? untracked(source));
  let frame = 0;
  const canAnimate = typeof requestAnimationFrame === 'function' && typeof performance !== 'undefined';

  effect(() => {
    const target = source();
    untracked(() => {
      if (canAnimate) cancelAnimationFrame(frame);
      const start = out();
      if (!canAnimate || motion.reduced() || start === target) {
        out.set(target);
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        out.set(p === 1 ? target : start + (target - start) * easeOutCubic(p));
        if (p < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
  });

  inject(DestroyRef).onDestroy(() => {
    if (canAnimate) cancelAnimationFrame(frame);
  });
  return out.asReadonly();
}
