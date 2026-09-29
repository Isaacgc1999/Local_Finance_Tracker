import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AppStatusFacade } from '../../facades/app-status.facade';

/**
 * Pila de avisos abajo a la izquierda (encima de la tab bar en móvil).
 * Cada aviso entra subiendo con un rebote leve y sale deslizándose; si trae
 * acción («Deshacer»), una barra fina marca el tiempo que queda para usarla.
 * El texto se anuncia por `aria-live`; la acción es un botón normal, así que
 * se alcanza con Tab.
 */
@Component({
  selector: 'ft-avisos',
  template: `
    <ol class="pila" aria-live="polite" aria-relevant="additions">
      @for (t of status.toasts(); track t.id) {
        <li class="aviso" [class]="'aviso tono-' + t.tone" [class.saliendo]="t.leaving">
          @if (t.tone !== 'neutral') {
            <span class="punto" aria-hidden="true"></span>
          }
          <span class="texto">{{ t.text }}</span>
          @if (t.action) {
            <button type="button" class="accion" (click)="status.runAction(t.id)">{{ t.action.label }}</button>
            <span class="cuenta" aria-hidden="true" [style.animation-duration.ms]="t.durationMs"></span>
          } @else {
            <button type="button" class="cerrar" aria-label="Cerrar aviso" (click)="status.dismiss(t.id)">✕</button>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: var(--ft-z-toast);
      max-width: min(420px, calc(100vw - 32px));
      pointer-events: none;
    }
    .pila {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
    .aviso {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 40px;
      padding: 8px 8px 8px 14px;
      overflow: hidden;
      border-radius: var(--ft-radius-control);
      background: var(--ft-surface-elevated);
      border: 1px solid var(--ft-border);
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
      font: var(--ft-font-meta-strong);
      line-height: 1.4;
      color: var(--ft-text-1);
      pointer-events: auto;
      animation: ft-toast-in var(--ft-dur-base) var(--ft-ease-spring) both;
    }
    .aviso.saliendo {
      animation: ft-toast-out 180ms var(--ft-ease-in) both;
    }
    .tono-income {
      --aviso-color: var(--ft-income);
    }
    .tono-expense {
      --aviso-color: var(--ft-expense);
    }
    .punto {
      flex: none;
      width: var(--ft-dot);
      height: var(--ft-dot);
      border-radius: var(--ft-radius-pill);
      background: var(--aviso-color);
    }
    .texto {
      flex: 1;
      min-width: 0;
    }
    .accion,
    .cerrar {
      flex: none;
      height: 28px;
      padding: 0 10px;
      border-radius: var(--ft-radius-segment);
      font: var(--ft-font-meta-strong);
      cursor: pointer;
      transition:
        background-color var(--ft-dur-fast) linear,
        color var(--ft-dur-fast) linear,
        transform var(--ft-dur-instant) var(--ft-ease-out);
    }
    .accion {
      color: var(--ft-accent);
    }
    .accion:hover {
      background: var(--ft-accent-12);
      color: var(--ft-accent-hover);
    }
    .cerrar {
      width: 28px;
      padding: 0;
      color: var(--ft-text-3);
    }
    .cerrar:hover {
      background: var(--ft-border);
      color: var(--ft-text-1);
    }
    .accion:active,
    .cerrar:active {
      transform: scale(var(--ft-press-scale));
    }
    // Tiempo que queda para «Deshacer».
    .cuenta {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 2px;
      background: var(--ft-accent);
      transform-origin: left;
      animation: ft-countdown linear both;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avisos {
  protected readonly status = inject(AppStatusFacade);
}
