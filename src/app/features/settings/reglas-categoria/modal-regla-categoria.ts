import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';

import { MIN_RULE_PATTERN_LENGTH } from '../../../core/types/category-rule';
import { CategoryRulesFacade, type RuleRow } from '../../../facades/category-rules.facade';
import { Modal } from '../../../shared/components/modal/modal';

/**
 * Alta y edición de una regla de categoría. Reutiliza el modal de 480px de la
 * hoja de componentes, como los otros modales de Ajustes.
 */
@Component({
  selector: 'ft-modal-regla-categoria',
  imports: [Modal],
  templateUrl: './modal-regla-categoria.html',
  styleUrl: './modal-regla-categoria.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalReglaCategoria {
  readonly abierto = model<boolean>(false);
  /** `null` = alta; una fila = edición. */
  readonly fila = input<RuleRow | null>(null);

  protected readonly facade = inject(CategoryRulesFacade);

  protected readonly patron = signal('');
  protected readonly categoriaId = signal('');
  protected readonly error = signal('');
  protected readonly guardando = signal(false);
  protected readonly confirmandoBorrado = signal(false);

  protected readonly edicion = computed(() => this.fila() !== null);
  protected readonly titulo = computed(() => (this.edicion() ? 'Editar regla' : 'Nueva regla'));
  protected readonly categorias = this.facade.categories;

  /** Ejemplo en vivo de cómo se leerá la regla. */
  protected readonly lectura = computed(() => {
    const p = this.patron().trim();
    const c = this.facade.categoryById().get(this.categoriaId());
    if (!p || !c) return '';
    return `Si el concepto contiene «${p}», la categoría será ${c.name}.`;
  });

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      const actual = this.fila();
      untracked(() => {
        this.patron.set(actual?.rule.pattern ?? '');
        this.categoriaId.set(actual?.rule.categoryId ?? this.facade.categories()[0]?.id ?? '');
        this.error.set('');
        this.confirmandoBorrado.set(false);
      });
    });
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected async guardar(): Promise<void> {
    const pattern = this.patron().trim();
    if (pattern.length < MIN_RULE_PATTERN_LENGTH) {
      this.error.set(`Escribe al menos ${MIN_RULE_PATTERN_LENGTH} caracteres.`);
      return;
    }
    const categoryId = this.categoriaId();
    if (!categoryId) {
      this.error.set('Elige una categoría.');
      return;
    }
    this.guardando.set(true);
    const actual = this.fila();
    const result = actual
      ? await this.facade.update(actual.rule.id, { pattern, categoryId })
      : await this.facade.create({ pattern, categoryId });
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
    else if (result.error.kind === 'validation') this.error.set(result.error.message);
  }

  protected async borrar(): Promise<void> {
    const actual = this.fila();
    if (!actual) return;
    if (!this.confirmandoBorrado()) {
      this.confirmandoBorrado.set(true);
      return;
    }
    this.guardando.set(true);
    const result = await this.facade.delete(actual.rule.id);
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
  }
}
