import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { formatMoney } from '../../../core/format/money-format';
import { FREQUENCY_LABEL, type Recurrence } from '../../../core/types/recurrence';
import { SettingsFacade } from '../../../facades/settings.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { ModalIngresoRecurrente } from './modal-ingreso-recurrente';

interface FilaIngreso {
  readonly recurrence: Recurrence;
  /** «Mensual · día 5». */
  readonly meta: string;
  readonly importe: string;
}

/**
 * «Ingresos recurrentes» del handoff: nombre, periodicidad e importe en
 * verde, con el enlace «+ Añadir ingreso recurrente» al pie. Solo se listan
 * las reglas de tipo `income`; el resto de recurrencias se gestionan desde el
 * formulario de evento.
 */
@Component({
  selector: 'ft-ingresos-recurrentes',
  imports: [ModalIngresoRecurrente],
  templateUrl: './ingresos-recurrentes.html',
  styleUrl: './ingresos-recurrentes.scss',
  host: { class: 'ft-card', '[class.compacta]': 'bp.isMobile()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngresosRecurrentes {
  protected readonly facade = inject(SettingsFacade);
  protected readonly bp = inject(BreakpointService);

  protected readonly modalAbierto = signal(false);
  protected readonly enEdicion = signal<Recurrence | null>(null);

  protected readonly filas = computed<readonly FilaIngreso[]>(() =>
    this.facade.incomes().map((recurrence) => ({
      recurrence,
      meta: this.describir(recurrence),
      importe: formatMoney(recurrence.amountCents, { sign: 'never' }),
    })),
  );

  protected nuevo(): void {
    this.enEdicion.set(null);
    this.modalAbierto.set(true);
  }

  protected editar(recurrence: Recurrence): void {
    this.enEdicion.set(recurrence);
    this.modalAbierto.set(true);
  }

  private describir(r: Recurrence): string {
    const base = FREQUENCY_LABEL[r.frequency];
    const cuando = r.frequency === 'weekly' ? null : r.dayOfMonth === null ? 'variable' : `día ${r.dayOfMonth}`;
    const partes = [base, cuando].filter((p): p is string => p !== null);
    if (!r.active) partes.push('pausado');
    return partes.join(' · ');
  }
}
