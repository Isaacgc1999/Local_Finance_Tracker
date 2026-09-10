import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Caja de display del handoff: `surface-elevated` r12, alineada a la derecha,
 * con la operación en curso arriba (400 15 text-3) y el resultado abajo en
 * display 700/40. El error de división entre cero sustituye a la operación.
 */
@Component({
  selector: 'ft-display-calc',
  template: `
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else {
      <p class="operacion num" aria-hidden="true">{{ expression() }}</p>
    }
    <output class="resultado num" [attr.aria-label]="'Resultado ' + display()">{{ display() }}</output>
  `,
  styleUrl: './display-calc.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisplayCalc {
  readonly expression = input<string>('');
  readonly display = input.required<string>();
  readonly error = input<string | null>(null);
}
