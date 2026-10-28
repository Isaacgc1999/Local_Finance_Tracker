import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { SettingsFacade } from '../../../facades/settings.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { FinancialMonthService } from '../../../infra/platform/financial-month.service';
import { NotificationsService } from '../../../infra/platform/notifications.service';
import { SegmentedControl, type SegmentOption } from '../../../shared/components/segmented-control/segmented-control';

type MonthMode = 'calendar' | 'payday';

const MODOS: readonly SegmentOption<MonthMode>[] = [
  { value: 'calendar', label: 'Mes natural' },
  { value: 'payday', label: 'Mes de nómina' },
];

const DIAS = Array.from({ length: 28 }, (_, i) => i + 1);

/**
 * «Mes y avisos»: cómo se cuenta el mes (natural o desde la nómina) y los
 * avisos del sistema.
 *
 * Con el mes de nómina, el mes empieza el día de referencia y, si entra
 * una nómina a ±7 días de ese día, empieza el día de la nómina: cobrar el 28
 * de octubre abre noviembre.
 */
@Component({
  selector: 'ft-mes-avisos',
  imports: [SegmentedControl],
  templateUrl: './mes-avisos.html',
  styleUrl: '../moneda-formato/moneda-formato.scss',
  host: { class: 'ft-card', '[class.compacta]': 'bp.isMobile()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MesAvisos {
  protected readonly facade = inject(SettingsFacade);
  protected readonly bp = inject(BreakpointService);
  private readonly fm = inject(FinancialMonthService);
  private readonly notifications = inject(NotificationsService);

  protected readonly modos = MODOS;
  protected readonly dias = DIAS;
  protected readonly modo = computed(() => this.facade.settings().monthMode);
  protected readonly dia = computed(() => this.facade.settings().monthStartDay);
  protected readonly avisos = computed(() => this.facade.settings().notificationsEnabled);
  protected readonly pruebaTexto = signal('');

  /** «Este mes: 28 oct – 27 nov» con lo que hay ahora mismo. */
  protected readonly ejemplo = computed(() => {
    const label = this.fm.current();
    const rango = this.fm.rangeLabel(label);
    return rango ? `Mes en curso: ${rango}.` : '';
  });

  protected onModo(value: MonthMode | null): void {
    if (value !== null && value !== this.modo()) void this.facade.setMonthMode(value);
  }

  protected onDia(value: string): void {
    const day = Number(value);
    if (Number.isInteger(day) && day !== this.dia()) void this.facade.setMonthStartDay(day);
  }

  protected onAvisos(enabled: boolean): void {
    void this.facade.setNotificationsEnabled(enabled);
  }

  protected async probar(): Promise<void> {
    const p = await this.notifications.test();
    this.pruebaTexto.set(
      p === 'granted'
        ? 'Enviado. Si no lo ves, revisa el centro de notificaciones y el modo «No molestar».'
        : p === 'denied'
          ? 'El sistema no deja mostrar avisos. Actívalos para Fintrack en la configuración de notificaciones.'
          : 'Este navegador no admite avisos.',
    );
  }
}
