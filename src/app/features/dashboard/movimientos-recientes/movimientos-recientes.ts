import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import type { Category } from '../../../core/types/category';
import type { Event } from '../../../core/types/event';
import { FilaMovimiento } from '../../../shared/components/fila-movimiento/fila-movimiento';

/** «Movimientos recientes» del handoff: 6 filas y enlace «Ver los 31» en acento. */
@Component({
  selector: 'ft-movimientos-recientes',
  imports: [RouterLink, FilaMovimiento],
  template: `
    <div class="cabecera">
      <span class="titulo">Movimientos recientes</span>
      @if (count() > 0) {
        <a routerLink="/events" class="ft-link">Ver los {{ count() }}</a>
      }
    </div>
    <div class="lista">
      @for (e of events(); track e.id) {
        <ft-fila-movimiento [event]="e" [categoria]="categoryById().get(e.categoryId ?? '') ?? null" (seleccionar)="abrir($event)" />
      }
      @empty {
        <p class="vacio">Todavía no hay movimientos este mes.</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: var(--ft-card-padding);
      background: var(--ft-surface);
      border: 1px solid var(--ft-border);
      border-radius: var(--ft-radius-card);
      min-width: 0;
    }
    .cabecera {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .titulo {
      font: var(--ft-font-label);
      color: var(--ft-text-1);
    }
    .lista {
      display: flex;
      flex-direction: column;
    }
    .lista ft-fila-movimiento + ft-fila-movimiento {
      border-top: 1px solid var(--ft-border-subtle);
    }
    .vacio {
      font: var(--ft-font-meta);
      line-height: 1.5;
      color: var(--ft-text-3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovimientosRecientes {
  readonly events = input.required<readonly Event[]>();
  readonly count = input.required<number>();
  readonly categoryById = input.required<ReadonlyMap<string, Category>>();
  private readonly router = inject(Router);

  protected abrir(e: Event): void {
    void this.router.navigate(['/events', e.id]);
  }
}
