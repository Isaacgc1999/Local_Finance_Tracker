import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal } from '@angular/core';

import type { Category, CategoryDraft, CategoryKind } from '../../../core/types/category';
import { SettingsFacade } from '../../../facades/settings.facade';
import { Modal } from '../../../shared/components/modal/modal';
import { SegmentedControl, type SegmentOption } from '../../../shared/components/segmented-control/segmented-control';

/** Paleta cerrada del handoff: no se puede elegir un color fuera del sistema. */
export const CATEGORY_COLORS: readonly string[] = [
  '#F45B5B',
  '#FBBF24',
  '#38BDF8',
  '#6E56F8',
  '#22C55E',
  '#9BA3AF',
];

const KINDS: readonly SegmentOption<CategoryKind>[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'both', label: 'Ambos' },
];

/**
 * Alta y edición de categoría. No está dibujado en el handoff (la pantalla
 * solo muestra los enlaces «+ Añadir categoría» y «Editar»), así que reutiliza
 * el modal de 480px de la hoja de componentes con la muestra de color de 28px
 * de la propia lista.
 */
@Component({
  selector: 'ft-modal-categoria',
  imports: [Modal, SegmentedControl],
  templateUrl: './modal-categoria.html',
  styleUrl: './modal-categoria.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalCategoria {
  readonly abierto = model<boolean>(false);
  /** `null` = alta; una categoría = edición. */
  readonly categoria = input<Category | null>(null);
  readonly guardado = output<void>();

  private readonly facade = inject(SettingsFacade);

  protected readonly colores = CATEGORY_COLORS;
  protected readonly kinds = KINDS;

  protected readonly nombre = signal('');
  protected readonly color = signal<string>(CATEGORY_COLORS[0] ?? '#F45B5B');
  protected readonly kind = signal<CategoryKind>('expense');
  protected readonly guardando = signal(false);
  protected readonly errorNombre = signal('');
  protected readonly confirmandoBorrado = signal(false);

  protected readonly edicion = computed(() => this.categoria() !== null);
  protected readonly titulo = computed(() => (this.edicion() ? 'Editar categoría' : 'Nueva categoría'));
  protected readonly esSistema = computed(() => this.categoria()?.isSystem === true);
  protected readonly usos = computed(() => {
    const id = this.categoria()?.id;
    return id ? (this.facade.categories().find((c) => c.category.id === id)?.uses ?? 0) : 0;
  });
  protected readonly avisoBorrado = computed(() =>
    this.usos() === 0
      ? 'No la usa ningún movimiento.'
      : `${this.usos() === 1 ? 'Un movimiento' : `${this.usos()} movimientos`} se quedará${this.usos() === 1 ? '' : 'n'} sin categoría.`,
  );

  constructor() {
    // Al abrir, el formulario se rellena con la categoría en edición o se limpia.
    effect(() => {
      if (!this.abierto()) return;
      const actual = this.categoria();
      this.nombre.set(actual?.name ?? '');
      this.color.set(actual?.color ?? CATEGORY_COLORS[0] ?? '#F45B5B');
      this.kind.set(actual?.kind ?? 'expense');
      this.errorNombre.set('');
      this.confirmandoBorrado.set(false);
    });
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected async guardar(): Promise<void> {
    const nombre = this.nombre().trim();
    if (!nombre) {
      this.errorNombre.set('El nombre es obligatorio.');
      return;
    }
    this.guardando.set(true);
    const actual = this.categoria();
    const result = actual
      ? await this.facade.updateCategory(actual.id, { name: nombre, color: this.color(), kind: this.kind() })
      : await this.facade.createCategory({
          name: nombre,
          color: this.color(),
          kind: this.kind(),
          icon: null,
          sortOrder: this.facade.categories().length,
        } satisfies CategoryDraft);
    this.guardando.set(false);
    if (result.ok) {
      this.abierto.set(false);
      this.guardado.emit();
    }
  }

  protected async borrar(): Promise<void> {
    const actual = this.categoria();
    if (!actual) return;
    if (!this.confirmandoBorrado()) {
      this.confirmandoBorrado.set(true);
      return;
    }
    this.guardando.set(true);
    const result = await this.facade.deleteCategory(actual.id);
    this.guardando.set(false);
    if (result.ok) {
      this.abierto.set(false);
      this.guardado.emit();
    }
  }
}
