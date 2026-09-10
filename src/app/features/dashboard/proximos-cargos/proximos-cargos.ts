import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatDayMonth, formatInDays } from '../../../core/format/date-format';
import { formatMoney } from '../../../core/format/money-format';
import { EVENT_AMOUNT_COLOR } from '../../../core/types/event';
import type { Money } from '../../../core/types/money';
import type { UpcomingCharge } from '../../../facades/dashboard.facade';

/**
 * «Próximos cargos» del handoff: 5 filas con nombre, meta «fecha · tipo»,
 * importe coloreado y «en N días»; cabecera con «1.103,30 € en 30 días».
 */
@Component({
  selector: 'ft-proximos-cargos',
  templateUrl: './proximos-cargos.html',
  styleUrl: './proximos-cargos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProximosCargos {
  readonly charges = input.required<readonly UpcomingCharge[]>();
  readonly total = input.required<Money>();
  readonly days = input<number>(30);

  protected readonly totalTexto = computed(() => `${formatMoney(this.total())} en ${this.days()} días`);
  protected readonly filas = computed(() =>
    this.charges().map((c) => ({
      ...c,
      meta: `${formatDayMonth(c.date)} · ${c.typeLabel}`,
      importe: formatMoney(c.amountCents),
      cuando: formatInDays(c.daysUntil),
      color: EVENT_AMOUNT_COLOR[c.type],
    })),
  );
}
