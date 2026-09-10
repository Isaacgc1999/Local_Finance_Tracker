import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Tono de la pill: fondo al 12 % + texto al 100 % del color semántico; `neutral` = superficie elevada + borde. */
export type PillTono = 'income' | 'expense' | 'investment' | 'savings' | 'accent' | 'neutral';

/** Pill de estado de 24px («Conectado», «No detectado», «Llama 3.1 · local»). */
@Component({
  selector: 'ft-pill-estado',
  template: `
    @if (punto()) {
      <span class="punto" aria-hidden="true"></span>
    }
    <ng-content />
  `,
  styleUrl: './pill-estado.scss',
  host: { '[class]': '"tono-" + tono()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PillEstado {
  readonly tono = input<PillTono>('neutral');
  readonly punto = input<boolean>(false);
}
