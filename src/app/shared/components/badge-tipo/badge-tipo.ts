import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, type EventType } from '../../../core/types/event';

/** Badge de tipo: 26px, r999, fondo al 12 % y texto al 100 % del color; Domiciliación neutro con borde. */
@Component({
  selector: 'ft-badge-tipo',
  template: `{{ label() }}`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      height: var(--ft-badge-h);
      padding: 0 10px;
      border-radius: var(--ft-radius-pill);
      font: var(--ft-font-meta-strong);
      white-space: nowrap;
      background: var(--ft-surface-elevated);
      border: 1px solid var(--ft-border);
      color: var(--ft-text-2);
    }
    :host(.tono-income) { background: var(--ft-income-12); border-color: transparent; color: var(--ft-income); }
    :host(.tono-expense) { background: var(--ft-expense-12); border-color: transparent; color: var(--ft-expense); }
    :host(.tono-investment) { background: var(--ft-investment-12); border-color: transparent; color: var(--ft-investment); }
    :host(.tono-savings) { background: var(--ft-savings-12); border-color: transparent; color: var(--ft-savings); }
    :host(.tono-accent) { background: var(--ft-accent-12); border-color: transparent; color: var(--ft-accent); }
  `,
  host: { '[class]': '"tono-" + tone()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeTipo {
  readonly type = input.required<EventType>();
  protected readonly label = computed(() => EVENT_TYPE_LABEL[this.type()]);
  protected readonly tone = computed(() => EVENT_TYPE_COLOR[this.type()]);
}
