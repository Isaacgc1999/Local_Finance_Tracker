import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, untracked } from '@angular/core';

import { MIN_RULE_PATTERN_LENGTH } from '../../../core/types/category-rule';
import { EventsFacade } from '../../../facades/events.facade';
import { ChipCategoria } from '../../../shared/components/chip-categoria/chip-categoria';
import { Modal } from '../../../shared/components/modal/modal';

/**
 * Cambiar la categoría de varios movimientos a la vez y, opcionalmente,
 * recordarlo como regla para los próximos con el mismo texto. Reutiliza el
 * modal de 480px y los chips de categoría del formulario.
 */
@Component({
  selector: 'ft-modal-recategorizar',
  imports: [Modal, ChipCategoria],
  templateUrl: './modal-recategorizar.html',
  styleUrl: './modal-recategorizar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalRecategorizar {
  readonly abierto = model<boolean>(false);

  protected readonly facade = inject(EventsFacade);

  protected readonly categoriaId = signal<string | null>(null);
  protected readonly recordar = signal(false);
  protected readonly patron = signal('');
  protected readonly error = signal('');

  protected readonly subtitulo = computed(() => {
    const n = this.facade.selectedCount();
    return n === 1 ? '1 movimiento seleccionado.' : `${n} movimientos seleccionados.`;
  });

  /** Ahorro e inversión no llevan categoría: se avisa de que quedan fuera. */
  protected readonly excluidos = computed(() => this.facade.selectedEvents().filter((e) => e.type === 'saving' || e.type === 'investment').length);

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      untracked(() => {
        this.categoriaId.set(null);
        const propuesta = this.facade.proposedPattern();
        this.patron.set(propuesta);
        this.recordar.set(false);
        this.error.set('');
      });
    });
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected async aplicar(): Promise<void> {
    const categoryId = this.categoriaId();
    if (!categoryId) {
      this.error.set('Elige una categoría.');
      return;
    }
    const pattern = this.recordar() ? this.patron().trim() : '';
    if (this.recordar() && pattern.length < MIN_RULE_PATTERN_LENGTH) {
      this.error.set(`El texto de la regla necesita al menos ${MIN_RULE_PATTERN_LENGTH} caracteres.`);
      return;
    }
    const result = await this.facade.recategorizeSelected(categoryId, pattern || null);
    if (result.ok) this.abierto.set(false);
    else if (result.error.kind === 'validation') this.error.set(result.error.message);
  }
}
