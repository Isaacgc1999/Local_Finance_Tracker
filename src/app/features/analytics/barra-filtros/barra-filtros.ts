import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { Category } from '../../../core/types/category';
import { EVENT_TYPES, EVENT_TYPE_LABEL, type EventType } from '../../../core/types/event';
import type { DateRange } from '../../../core/types/iso-date';
import { GRANULARITIES, GRANULARITY_LABEL, type Granularity } from '../../../domain/analytics/periods';
import type { AnalyticsFilters, ExportOptions } from '../../../facades/analytics.facade';
import { type MenuItem, MenuDesplegable } from '../../../shared/components/menu-desplegable/menu-desplegable';
import { type MultiOption, PopoverMultiseleccion } from '../../../shared/components/popover-multiseleccion/popover-multiseleccion';
import { SegmentedControl, type SegmentOption } from '../../../shared/components/segmented-control/segmented-control';
import { SelectorRango } from '../../../shared/components/selector-rango/selector-rango';

/**
 * Barra de filtros pegajosa del handoff: granularidad, rango, Categorías y
 * Tipos con contador, «Limpiar» y «Exportar ▾» con menú de 212px.
 * 768: segmented + Exportar arriba, rango y pills debajo. 390: título
 * «Analítica» + Exportar, segmented a lo ancho y pills con scroll.
 */
@Component({
  selector: 'ft-barra-filtros',
  imports: [SegmentedControl, SelectorRango, PopoverMultiseleccion, MenuDesplegable],
  templateUrl: './barra-filtros.html',
  styleUrl: './barra-filtros.scss',
  host: { '[class]': '"variante-" + variante()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarraFiltros {
  readonly filters = input.required<AnalyticsFilters>();
  readonly categories = input.required<readonly Category[]>();
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');

  readonly granularityChange = output<Granularity>();
  readonly rangeChange = output<DateRange>();
  readonly categoriesChange = output<readonly string[]>();
  readonly typesChange = output<readonly EventType[]>();
  readonly clear = output<void>();
  readonly exportar = output<ExportOptions['format']>();

  protected readonly granularidades: readonly SegmentOption<Granularity>[] = GRANULARITIES.map((g) => ({ value: g, label: GRANULARITY_LABEL[g] }));
  protected readonly tipos: readonly MultiOption[] = EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABEL[t] }));
  protected readonly categoriaOpciones = computed<readonly MultiOption[]>(() => this.categories().map((c) => ({ value: c.id, label: c.name })));
  protected readonly formatos: readonly MenuItem<ExportOptions['format']>[] = [
    { value: 'xlsx', label: 'Excel', hint: '.xlsx' },
    { value: 'pdf', label: 'PDF', hint: '.pdf' },
    { value: 'docx', label: 'Word', hint: '.docx' },
  ];
  protected readonly hayFiltros = computed(() => this.filters().categoryIds.length > 0 || this.filters().types.length > 0);

  protected onGranularity(value: Granularity | null): void {
    if (value) this.granularityChange.emit(value);
  }

  protected onTypes(values: readonly string[]): void {
    this.typesChange.emit(values.filter((v): v is EventType => (EVENT_TYPES as readonly string[]).includes(v)));
  }
}
