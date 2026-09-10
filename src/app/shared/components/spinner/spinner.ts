import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Spinner del handoff: círculo de 16px con el borde superior en acento y pulso 1,4 s. */
@Component({
  selector: 'ft-spinner',
  template: '',
  styles: `
    :host {
      display: block;
      width: 16px;
      height: 16px;
      flex: none;
      border-radius: var(--ft-radius-pill);
      border: 2px solid var(--ft-border);
      border-top-color: var(--ft-accent);
      animation: var(--ft-anim-pulse);
    }
  `,
  host: { role: 'status', 'aria-label': 'Generando' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Spinner {}
