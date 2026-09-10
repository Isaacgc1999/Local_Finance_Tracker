import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';

import { formatAmount, parseMoney } from '../../../core/format/money-format';
import {
  type BaseBudgetScope,
  BUDGET_SCOPE_HINT,
  type BudgetScope,
  budgetKindOf,
  categoryIdOf,
} from '../../../core/types/budget';
import { type BudgetRow, SettingsFacade } from '../../../facades/settings.facade';
import { Modal } from '../../../shared/components/modal/modal';

/**
 * Alta y edición de un presupuesto. Como los otros modales de Ajustes, no está
 * dibujado en el handoff y reutiliza el modal de 480px de la hoja de
 * componentes. Al editar, el tipo queda fijo: cambiarlo sería otro
 * presupuesto, así que se borra y se crea de nuevo.
 */
@Component({
  selector: 'ft-modal-presupuesto',
  imports: [Modal],
  templateUrl: './modal-presupuesto.html',
  styleUrl: './modal-presupuesto.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalPresupuesto {
  readonly abierto = model<boolean>(false);
  readonly fila = input<BudgetRow | null>(null);

  protected readonly facade = inject(SettingsFacade);

  protected readonly scope = signal<BudgetScope | ''>('');
  protected readonly importeTexto = signal('');
  protected readonly error = signal('');
  protected readonly guardando = signal(false);
  protected readonly confirmandoBorrado = signal(false);

  protected readonly edicion = computed(() => this.fila() !== null);
  protected readonly titulo = computed(() => (this.edicion() ? 'Editar presupuesto' : 'Nuevo presupuesto'));
  protected readonly opcionesBase = computed(() => this.facade.availableScopes().filter((o) => o.group === 'base'));
  protected readonly opcionesCategoria = computed(() =>
    this.facade.availableScopes().filter((o) => o.group === 'category'),
  );

  private readonly scopeActivo = computed<BudgetScope | ''>(() => this.fila()?.budget.scope ?? this.scope());

  protected readonly esObjetivo = computed(() => {
    const s = this.scopeActivo();
    return s !== '' && budgetKindOf(s) === 'goal';
  });

  protected readonly pista = computed(() => {
    const s = this.scopeActivo();
    if (s === '') return '';
    const tipo = budgetKindOf(s) === 'goal' ? 'Objetivo: cuanto más cerca del 100 %, mejor.' : 'Límite: la analítica avisa al pasar del 80 %.';
    const que = categoryIdOf(s) !== null ? 'Gastos de esta categoría.' : `${BUDGET_SCOPE_HINT[s as BaseBudgetScope]}.`;
    return `${que} ${tipo}`;
  });

  constructor() {
    // Al abrir se rellena con el presupuesto en edición o con la primera opción libre.
    effect(() => {
      if (!this.abierto()) return;
      const actual = this.fila();
      untracked(() => {
        this.scope.set(actual?.budget.scope ?? this.facade.availableScopes()[0]?.scope ?? '');
        this.importeTexto.set(actual ? formatAmount(actual.budget.amountCents, 'never') : '');
        this.error.set('');
        this.confirmandoBorrado.set(false);
      });
    });
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected async guardar(): Promise<void> {
    const scope = this.scopeActivo();
    if (scope === '') {
      this.error.set('Elige qué quieres presupuestar.');
      return;
    }
    const parsed = parseMoney(this.importeTexto());
    if (!parsed.ok) {
      this.error.set('Importe no válido.');
      return;
    }
    if (parsed.value <= 0) {
      this.error.set('El importe tiene que ser mayor que cero.');
      return;
    }
    this.guardando.set(true);
    const result = await this.facade.saveBudget(scope, parsed.value);
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
  }

  protected async borrar(): Promise<void> {
    const actual = this.fila();
    if (!actual) return;
    if (!this.confirmandoBorrado()) {
      this.confirmandoBorrado.set(true);
      return;
    }
    this.guardando.set(true);
    const result = await this.facade.deleteBudget(actual.budget.id);
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
  }
}
