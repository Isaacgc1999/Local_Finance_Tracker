import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** FAB de 56px, glifo «+» de 28px, anclado 16px a la derecha y 96px del fondo (README). */
@Component({
  selector: 'ft-fab',
  imports: [RouterLink],
  template: `<a routerLink="/events/new" aria-label="Nuevo evento" title="Nuevo evento">+</a>`,
  styles: `
    :host {
      position: fixed;
      right: var(--ft-fab-right);
      bottom: var(--ft-fab-bottom);
      z-index: var(--ft-z-fab);
    }
    a {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--ft-fab-size);
      height: var(--ft-fab-size);
      border-radius: var(--ft-radius-pill);
      background: var(--ft-accent);
      color: var(--ft-on-accent);
      font: 400 28px/1 var(--ft-font-family);
    }
    a:hover {
      background: var(--ft-accent-hover);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Fab {}
