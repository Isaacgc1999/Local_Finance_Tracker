import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import type { DateFormat } from '../../../core/format/date-format';
import { CURRENCIES, type Currency } from '../../../core/format/money-format';
import { SettingsFacade } from '../../../facades/settings.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { SegmentedControl, type SegmentOption } from '../../../shared/components/segmented-control/segmented-control';

const FORMATOS: readonly SegmentOption<DateFormat>[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/AAAA' },
  { value: 'YYYY-MM-DD', label: 'AAAA-MM-DD' },
];

const MONEDAS: readonly { readonly code: Currency; readonly label: string }[] = (
  Object.keys(CURRENCIES) as Currency[]
).map((code) => ({ code, label: CURRENCIES[code].label }));

/**
 * «Moneda y formato»: select de moneda y segmented de formato de fecha.
 *
 * Euro o dólar estadounidense. Es una moneda de visualización: los importes
 * se guardan en céntimos y no se convierten, solo cambia el símbolo en toda la
 * app (pantallas, exportaciones e informe de IA). El formato numérico sigue
 * siendo es-ES.
 */
@Component({
  selector: 'ft-moneda-formato',
  imports: [SegmentedControl],
  templateUrl: './moneda-formato.html',
  styleUrl: './moneda-formato.scss',
  host: { class: 'ft-card', '[class.compacta]': 'bp.isMobile()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonedaFormato {
  protected readonly facade = inject(SettingsFacade);
  protected readonly bp = inject(BreakpointService);

  protected readonly formatos = FORMATOS;
  protected readonly monedas = MONEDAS;
  protected readonly formato = computed(() => this.facade.settings().dateFormat);
  protected readonly moneda = computed(() => this.facade.settings().currency);

  protected onFormato(value: DateFormat | null): void {
    if (value !== null && value !== this.formato()) void this.facade.setDateFormat(value);
  }

  protected onMoneda(value: string): void {
    if ((value === 'EUR' || value === 'USD') && value !== this.moneda()) void this.facade.setCurrency(value);
  }
}
