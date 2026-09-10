import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import type { Category } from '../../../core/types/category';
import { SettingsFacade } from '../../../facades/settings.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { ModalCategoria } from './modal-categoria';

/**
 * «Categorías» del handoff: filas separadas por una línea `border-subtle`,
 * con muestra de color de 28px, nombre, número de movimientos y «Editar».
 * En 768 y 390 el handoff no dibuja el enlace «Editar» de cada fila, así que
 * la fila entera es el objetivo pulsable y el enlace solo aparece en 1440.
 */
@Component({
  selector: 'ft-lista-categorias',
  imports: [ModalCategoria, Skeleton],
  templateUrl: './lista-categorias.html',
  styleUrl: './lista-categorias.scss',
  host: { class: 'ft-card', '[class.compacta]': 'bp.isMobile()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListaCategorias {
  protected readonly facade = inject(SettingsFacade);
  protected readonly bp = inject(BreakpointService);

  protected readonly modalAbierto = signal(false);
  protected readonly enEdicion = signal<Category | null>(null);

  protected nueva(): void {
    this.enEdicion.set(null);
    this.modalAbierto.set(true);
  }

  protected editar(categoria: Category): void {
    this.enEdicion.set(categoria);
    this.modalAbierto.set(true);
  }
}
