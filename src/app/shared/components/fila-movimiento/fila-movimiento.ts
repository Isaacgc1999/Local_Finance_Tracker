import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { formatDayMonth } from '../../../core/format/date-format';
import { formatMoney } from '../../../core/format/money-format';
import type { Category } from '../../../core/types/category';
import {
  EVENT_AMOUNT_COLOR,
  EVENT_SOURCE_LABEL,
  EVENT_TYPE_LABEL,
  type Event,
  NATURE_LABEL,
  initialsOf,
} from '../../../core/types/event';

export type FilaEstado = 'normal' | 'activo' | 'deshabilitada' | 'error';

/**
 * Fila de movimiento (hoja de componentes): avatar de 32px con iniciales
 * sobre el tono de su tipo al 12 % (seis colores, uno por tipo), concepto
 * 15/500 con las pastillas de tipo y origen (Manual / Importado /
 * Recurrente), meta 13/400 e importe tabular a la derecha: verde con «+» lo
 * que entra, rojo con «−» todo lo que sale. Estados normal / hover / activo
 * / foco / deshabilitada / error.
 */
@Component({
  selector: 'ft-fila-movimiento',
  templateUrl: './fila-movimiento.html',
  styleUrl: './fila-movimiento.scss',
  host: {
    '[class]': '"estado-" + estado() + " color-" + color() + " tipo-" + event().type',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilaMovimiento {
  readonly event = input.required<Event>();
  readonly categoria = input<Category | null>(null);
  readonly estado = input<FilaEstado>('normal');
  /** Texto de la meta en estado error («Importe duplicado con el 7 sep»). */
  readonly errorTexto = input<string>('');
  readonly seleccionar = output<Event>();

  protected readonly iniciales = computed(() => initialsOf(this.event().concept));
  protected readonly color = computed(() => EVENT_AMOUNT_COLOR[this.event().type]);
  protected readonly tipo = computed(() => EVENT_TYPE_LABEL[this.event().type]);
  protected readonly origen = computed(() => EVENT_SOURCE_LABEL[this.event().source]);

  protected readonly meta = computed(() => {
    if (this.estado() === 'error' && this.errorTexto()) return this.errorTexto();
    const e = this.event();
    const parts: string[] = [];
    if (e.type === 'expense') {
      parts.push(this.categoria()?.name ?? 'Sin categoría');
      if (e.nature) parts.push(NATURE_LABEL[e.nature]);
    } else {
      parts.push(this.categoria()?.name ?? EVENT_TYPE_LABEL[e.type]);
      const detail =
        e.paymentMethod ??
        (e.meta?.type === 'investment' ? (e.meta.platform ?? null) : e.meta?.type === 'income' ? (e.meta.source ?? null) : null);
      if (detail) parts.push(detail);
    }
    parts.push(formatDayMonth(e.date));
    return parts.join(' · ');
  });

  protected readonly importe = computed(() => {
    const e = this.event();
    if (e.type === 'income') return formatMoney(e.amountCents, { sign: 'always' });
    return formatMoney((-e.amountCents) as typeof e.amountCents);
  });

  protected onClick(): void {
    if (this.estado() !== 'deshabilitada') this.seleccionar.emit(this.event());
  }
}
