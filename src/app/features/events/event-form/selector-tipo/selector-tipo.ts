import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';

import { EVENT_TYPES, EVENT_TYPE_LABEL, EVENT_TYPE_LABEL_SHORT, type EventType } from '../../../../core/types/event';
import { BreakpointService } from '../../../../infra/platform/breakpoint.service';
import { SegmentedControl, type SegmentOption } from '../../../../shared/components/segmented-control/segmented-control';

/**
 * Selector de tipo del handoff: segmented de 6 opciones en escritorio,
 * rejilla 3×2 en 768 y fila de chips con scroll en 390.
 */
@Component({
  selector: 'ft-selector-tipo',
  imports: [SegmentedControl],
  template: `
    <ft-segmented-control
      label="Tipo de evento"
      appearance="primary"
      [layout]="layout()"
      [options]="options()"
      [(value)]="value"
      [disabled]="disabled()"
    />
  `,
  styles: `
    :host {
      display: block;
      max-width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectorTipo {
  private readonly bp = inject(BreakpointService);

  readonly value = model.required<EventType | null>();
  readonly disabled = input<boolean>(false);

  protected readonly layout = computed(() =>
    this.bp.isMobile() ? ('chips' as const) : this.bp.isTablet() ? ('grid-3x2' as const) : ('row' as const),
  );

  protected readonly options = computed<readonly SegmentOption<EventType>[]>(() =>
    EVENT_TYPES.map((t) => ({ value: t, label: this.bp.isMobile() ? EVENT_TYPE_LABEL_SHORT[t] : EVENT_TYPE_LABEL[t] })),
  );
}
