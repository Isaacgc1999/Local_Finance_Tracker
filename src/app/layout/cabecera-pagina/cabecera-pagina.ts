import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Cabecera de pantalla: título 600/24 (+ subtítulo 13/1.5 en text-3) a la
 * izquierda y acciones a la derecha. Componente propio (no está nombrado en
 * el handoff) que reproduce la cabecera de todas las pantallas.
 * Slots: `[inicio]` sustituye al título (selector de mes), `[acciones]` a la derecha.
 */
@Component({
  selector: 'ft-cabecera-pagina',
  template: `
    <div class="inicio">
      <ng-content select="[inicio]">
        <div>
          <h1 class="titulo">{{ titulo() }}</h1>
          @if (subtitulo()) {
            <p class="subtitulo">{{ subtitulo() }}</p>
          }
        </div>
      </ng-content>
    </div>
    <div class="acciones">
      <ng-content select="[acciones]" />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      min-width: 0;
    }
    :host(.arriba) {
      align-items: flex-start;
    }
    .inicio {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .titulo {
      font: var(--ft-font-title);
      color: var(--ft-text-1);
    }
    .subtitulo {
      font: var(--ft-font-meta);
      line-height: 1.5;
      color: var(--ft-text-3);
      margin-top: 6px;
    }
    .acciones {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: none;
    }
    .acciones:empty {
      display: none;
    }
  `,
  host: { '[class.arriba]': '!!subtitulo()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CabeceraPagina {
  readonly titulo = input<string>('');
  readonly subtitulo = input<string>('');
}
