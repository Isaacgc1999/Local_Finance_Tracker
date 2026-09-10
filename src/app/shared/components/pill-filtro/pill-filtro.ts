import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Pill de filtro con contador en badge acento («Categorías 3»), 38px (34 tablet, 32 móvil). */
@Component({
  selector: 'ft-pill-filtro',
  template: `
    <button
      type="button"
      class="pill"
      [attr.aria-expanded]="expanded()"
      [attr.aria-haspopup]="expanded() === null ? null : 'dialog'"
      (click)="pulsar.emit()"
    >
      {{ label() }}
      @if (count() > 0) {
        <span class="contador num">{{ count() }}</span>
      }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: var(--ft-filter-h);
      padding: 0 14px;
      border-radius: var(--ft-radius-pill);
      background: var(--ft-surface-elevated);
      border: 1px solid var(--ft-border);
      color: var(--ft-text-1);
      font: var(--ft-font-meta-strong);
      cursor: pointer;
      white-space: nowrap;
    }
    .pill:hover {
      background: var(--ft-border);
    }
    .contador {
      padding: 2px 7px;
      border-radius: var(--ft-radius-pill);
      background: var(--ft-accent);
      color: var(--ft-on-accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PillFiltro {
  readonly label = input.required<string>();
  readonly count = input<number>(0);
  /** `null` cuando la pill no despliega nada. */
  readonly expanded = input<boolean | null>(null);
  readonly pulsar = output<void>();
}
