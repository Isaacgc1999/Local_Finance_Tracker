import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { formatDayMonth, formatMonthYear } from '../../../core/format/date-format';
import { type IsoDate, addMonthsClamped, startOfMonth, todayIso } from '../../../core/types/iso-date';

/**
 * Cabecera de mes del handoff: flechas ‹ › (32×32, r8), «Septiembre 2026»
 * (600/24, ancho mínimo 200px, centrado) y pill «Hoy · 9 sep» que vuelve al
 * mes en curso. En compacto: «Sept. 2026», flechas de 28px y sin pill.
 */
@Component({
  selector: 'ft-selector-mes',
  template: `
    <button type="button" class="ft-btn ft-btn--icon" aria-label="Mes anterior" (click)="mover(-1)">‹</button>
    <h1 class="mes" [class.mes--compacto]="compacto()">{{ etiqueta() }}</h1>
    <button type="button" class="ft-btn ft-btn--icon" aria-label="Mes siguiente" (click)="mover(1)">›</button>
    @if (!compacto()) {
      <button type="button" class="hoy" (click)="irAHoy()" [disabled]="esMesActual()">Hoy · {{ hoyLabel() }}</button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    :host(.compacto) {
      gap: 8px;
    }
    .mes {
      min-width: 200px;
      text-align: center;
      font: var(--ft-font-title);
      color: var(--ft-text-1);
    }
    .mes--compacto {
      min-width: 0;
    }
    .hoy {
      margin-left: 8px;
      height: 32px;
      padding: 0 14px;
      border-radius: var(--ft-radius-pill);
      border: 1px solid var(--ft-border);
      background: var(--ft-surface);
      color: var(--ft-text-2);
      font: var(--ft-font-meta);
      cursor: pointer;
      white-space: nowrap;
    }
    .hoy:hover:not(:disabled) {
      color: var(--ft-text-1);
    }
    .hoy:disabled {
      cursor: default;
      opacity: 0.7;
    }
  `,
  host: { '[class.compacto]': 'compacto()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectorMes {
  /** Cualquier día del mes visible; se normaliza al día 1. */
  readonly value = model.required<IsoDate>();
  readonly compacto = input<boolean>(false);
  readonly hoy = input<IsoDate>(todayIso());

  protected readonly etiqueta = computed(() => formatMonthYear(this.value(), this.compacto() ? 'short' : 'long'));
  protected readonly hoyLabel = computed(() => formatDayMonth(this.hoy()));
  protected readonly esMesActual = computed(() => startOfMonth(this.value()) === startOfMonth(this.hoy()));

  protected mover(delta: number): void {
    this.value.set(addMonthsClamped(startOfMonth(this.value()), delta, 1));
  }

  protected irAHoy(): void {
    this.value.set(startOfMonth(this.hoy()));
  }
}
