import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Iconos geométricos del handoff (18px, trazo 1.6, currentColor, extremos redondos). */
export type IconName = 'dashboard' | 'movimientos' | 'cuentas' | 'analitica' | 'ia' | 'ajustes';

@Component({
  selector: 'ft-icono',
  templateUrl: './icono.html',
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icono {
  readonly name = input.required<IconName>();
  readonly size = input<number>(18);
}
