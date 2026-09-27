import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { CategoryRulesFacade, type RuleRow } from '../../../facades/category-rules.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { ModalReglaCategoria } from './modal-regla-categoria';

/**
 * «Reglas de categoría»: «si el concepto contiene X, la categoría es Y».
 * Misma anatomía que las otras listas de Ajustes (filas separadas por una
 * línea `border-subtle`, «+ Añadir» arriba). Las reglas se aplican al
 * importar extractos y como sugerencia en el formulario; «Aplicar a los
 * existentes» recategoriza lo que quedó sin clasificar.
 */
@Component({
  selector: 'ft-reglas-categoria',
  imports: [ModalReglaCategoria, Skeleton],
  templateUrl: './reglas-categoria.html',
  styleUrl: './reglas-categoria.scss',
  host: { class: 'ft-card', '[class.compacta]': 'bp.isMobile()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReglasCategoria {
  protected readonly facade = inject(CategoryRulesFacade);
  protected readonly bp = inject(BreakpointService);

  protected readonly modalAbierto = signal(false);
  protected readonly enEdicion = signal<RuleRow | null>(null);

  protected nueva(): void {
    this.enEdicion.set(null);
    this.modalAbierto.set(true);
  }

  protected editar(fila: RuleRow): void {
    this.enEdicion.set(fila);
    this.modalAbierto.set(true);
  }

  protected aplicar(): void {
    void this.facade.applyToExisting();
  }
}
