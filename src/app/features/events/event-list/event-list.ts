import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { describeError } from '../../../core/errors/app-error';
import { formatMonthYear, formatWeekdayDayMonth } from '../../../core/format/date-format';
import { formatMoney } from '../../../core/format/money-format';
import { EVENT_TYPES, EVENT_TYPE_LABEL, type Event as FtEvent, type EventType } from '../../../core/types/event';
import { type IsoDate, month, year } from '../../../core/types/iso-date';
import { EventsFacade } from '../../../facades/events.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { CabeceraPagina } from '../../../layout/cabecera-pagina/cabecera-pagina';
import { EstadoVacio } from '../../../shared/components/estado-vacio/estado-vacio';
import { FilaMovimiento } from '../../../shared/components/fila-movimiento/fila-movimiento';
import { type MultiOption, PopoverMultiseleccion } from '../../../shared/components/popover-multiseleccion/popover-multiseleccion';
import { SelectorMes } from '../../../shared/components/selector-mes/selector-mes';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { TarjetaError } from '../../../shared/components/tarjeta-error/tarjeta-error';
import { ModalRecategorizar } from './modal-recategorizar';

/**
 * Listado de movimientos (pantalla sin diseño en el handoff; propuesta
 * FASE-0 §a-1): selector de mes, búsqueda, filtro de tipos y filas agrupadas
 * por día con la Fila de movimiento del handoff. Pulsar una fila edita; en
 * modo selección la marca, para cambiar la categoría o borrar en bloque.
 */
@Component({
  selector: 'ft-event-list',
  imports: [RouterLink, CabeceraPagina, SelectorMes, PopoverMultiseleccion, FilaMovimiento, EstadoVacio, Skeleton, TarjetaError, ModalRecategorizar],
  templateUrl: './event-list.html',
  styleUrl: './event-list.scss',
  host: { class: 'ft-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventList {
  protected readonly facade = inject(EventsFacade);
  protected readonly bp = inject(BreakpointService);
  private readonly router = inject(Router);

  protected readonly tipos: readonly MultiOption[] = EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABEL[t] }));
  protected readonly modalCategoria = signal(false);

  protected readonly seleccionLabel = computed(() => {
    const n = this.facade.selectedCount();
    return n === 1 ? '1 seleccionado' : `${n} seleccionados`;
  });

  protected readonly mesLabel = computed(() => formatMonthYear(this.facade.month()).toLowerCase());
  protected readonly errorTexto = computed(() => {
    const e = this.facade.error();
    return e ? describeError(e) : '';
  });
  protected readonly resumen = computed(() => {
    const n = this.facade.total();
    return n === 1 ? '1 movimiento' : `${n} movimientos`;
  });

  protected diaLabel(date: IsoDate): string {
    return formatWeekdayDayMonth(date);
  }

  protected balanceLabel(cents: number): string {
    return formatMoney(cents as never, { sign: 'always' });
  }

  protected setTipos(values: readonly string[]): void {
    this.facade.types.set(values.filter((v): v is EventType => (EVENT_TYPES as readonly string[]).includes(v)));
  }

  protected onSearch(event: Event): void {
    this.facade.search.set((event.target as HTMLInputElement).value);
  }

  protected nuevo(): void {
    void this.router.navigate(['/events/new']);
  }

  protected abrir(e: FtEvent): void {
    if (this.facade.selecting()) {
      this.facade.toggleSelected(e.id);
      return;
    }
    void this.router.navigate(['/events', e.id]);
  }

  protected estadoFila(e: FtEvent): 'normal' | 'activo' {
    return this.facade.selecting() && this.facade.selected().has(e.id) ? 'activo' : 'normal';
  }

  protected toggleTodos(event: Event): void {
    this.facade.selectAllVisible((event.target as HTMLInputElement).checked);
  }

  protected esMesActual(): boolean {
    const m = this.facade.month();
    const now = new Date();
    return year(m) === now.getFullYear() && month(m) === now.getMonth() + 1;
  }
}
