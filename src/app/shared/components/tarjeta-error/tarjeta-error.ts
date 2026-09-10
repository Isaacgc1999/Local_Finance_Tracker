import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Estado de error del handoff (pantalla IA, 768): tarjeta con borde `expense`,
 * título 15/1.4, ayuda 13/1.6 y botón primario «Reintentar».
 */
@Component({
  selector: 'ft-tarjeta-error',
  template: `
    <div class="texto">
      <p class="titulo">{{ titulo() }}</p>
      @if (texto()) {
        <p class="ayuda">{{ texto() }}</p>
      }
    </div>
    @if (accionLabel()) {
      <button type="button" class="ft-btn ft-btn--primary" (click)="accion.emit()">{{ accionLabel() }}</button>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: var(--ft-surface);
      border: 1px solid var(--ft-expense);
      border-radius: var(--ft-radius-card);
    }
    .texto {
      flex: 1;
      min-width: 0;
    }
    .titulo {
      font: var(--ft-font-label);
      line-height: 1.4;
      color: var(--ft-text-1);
    }
    .ayuda {
      font: var(--ft-font-meta);
      line-height: 1.6;
      color: var(--ft-text-2);
      margin-top: 6px;
      overflow-wrap: anywhere;
    }
    @media (max-width: 640px) {
      :host {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `,
  host: { role: 'alert' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TarjetaError {
  readonly titulo = input.required<string>();
  readonly texto = input<string>('');
  readonly accionLabel = input<string>('');
  readonly accion = output<void>();
}
