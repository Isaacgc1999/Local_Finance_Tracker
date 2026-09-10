import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { formatMoney } from '../../../core/format/money-format';
import { formatBasisPoints } from '../../../core/format/percent-format';
import type { Money } from '../../../core/types/money';
import { type BudgetRow, SettingsFacade } from '../../../facades/settings.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { ModalPresupuesto } from './modal-presupuesto';

/**
 * «Presupuestos»: sustituye al «Presupuesto mensual objetivo» único del
 * handoff. Cada fila es un ámbito que el usuario quiere vigilar al mes (gasto
 * total, fijos, ocio, suscripciones, una categoría…, como límite; ahorro e
 * inversión, como objetivo). La analítica calcula hasta dónde ha llegado cada
 * uno. Anatomía de las listas de Ajustes: filas separadas por una línea
 * `border-subtle`, importe tabular a la derecha y enlace «+ Añadir» arriba.
 */
@Component({
  selector: 'ft-presupuestos',
  imports: [ModalPresupuesto],
  templateUrl: './presupuestos.html',
  styleUrl: './presupuestos.scss',
  host: { class: 'ft-card', '[class.compacta]': 'bp.isMobile()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Presupuestos {
  protected readonly facade = inject(SettingsFacade);
  protected readonly bp = inject(BreakpointService);

  protected readonly modalAbierto = signal(false);
  protected readonly enEdicion = signal<BudgetRow | null>(null);

  /** La lectura del handoff («…deja una tasa de ahorro del 31,6 %»), si hay límite de gasto total. */
  protected readonly lectura = computed(() => {
    const income = this.facade.averageIncome();
    const rate = this.facade.targetSavingsRateBp();
    if (this.facade.totalBudget() === null || income <= 0 || rate === null) return '';
    const media = formatMoney(income);
    if (rate < 0) return `Sobre unos ingresos medios de ${media}, el límite de gasto total supera lo que ingresas.`;
    return `Sobre unos ingresos medios de ${media}, el límite de gasto total deja una tasa de ahorro del ${formatBasisPoints(rate)}.`;
  });

  protected importe(value: Money): string {
    return formatMoney(value);
  }

  protected tono(fila: BudgetRow): string {
    if (fila.budget.scope === 'saving') return 'ft-c-savings';
    if (fila.budget.scope === 'investment') return 'ft-c-investment';
    return '';
  }

  protected nuevo(): void {
    this.enEdicion.set(null);
    this.modalAbierto.set(true);
  }

  protected editar(fila: BudgetRow): void {
    this.enEdicion.set(fila);
    this.modalAbierto.set(true);
  }
}
