import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { EVENT_TYPE_LABEL, type EventType } from '../../../core/types/event';

/** Badge de tipo: 26px, r999, fondo al 14 % y texto al 100 % del tono del tipo (uno distinto por tipo). */
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
    :host([class*='tono-']) {
      border-color: transparent;
      background: color-mix(in srgb, var(--badge-color) 14%, transparent);
      color: var(--badge-color);
    }
    :host(.tono-expense) { --badge-color: var(--ft-type-expense); }
    :host(.tono-income) { --badge-color: var(--ft-type-income); }
    :host(.tono-subscription) { --badge-color: var(--ft-type-subscription); }
    :host(.tono-direct_debit) { --badge-color: var(--ft-type-direct_debit); }
    :host(.tono-saving) { --badge-color: var(--ft-type-saving); }
    :host(.tono-investment) { --badge-color: var(--ft-type-investment); }
  `,
  host: { '[class]': '"tono-" + tone()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeTipo {
  readonly type = input.required<EventType>();
  protected readonly label = computed(() => EVENT_TYPE_LABEL[this.type()]);
  protected readonly tone = computed(() => this.type());
}
