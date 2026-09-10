import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * Segmented control del handoff.
 * - `appearance: 'primary'`: contenedor `surface` + borde, padding 4, r12,
 *   segmento activo acento sólido r8 (selector de tipo).
 * - `appearance: 'compact'`: pista `surface-elevated`, padding 3, gap 3,
 *   activo r6 en acento (`tone: 'accent'`, granularidad) o en `border`
 *   (`tone: 'subtle'`, naturaleza / frecuencia / pestañas).
 * - `layout`: `row` (inline), `stretch` (segmentos a partes iguales),
 *   `grid-3x2` (tablet, selector de tipo) o `chips` (fila con scroll, móvil).
 * Radiogroup accesible: flechas para moverse, Espacio/Intro para elegir.
 */
@Component({
  selector: 'ft-segmented-control',
  templateUrl: './segmented-control.html',
  styleUrl: './segmented-control.scss',
  host: {
    role: 'radiogroup',
    '[attr.aria-label]': 'label()',
    '[class]': '"appearance-" + appearance() + " layout-" + layout() + " tone-" + tone()',
    '(keydown)': 'onKeydown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentedControl<T extends string> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = model<T | null>(null);
  readonly label = input<string>('');
  readonly appearance = input<'primary' | 'compact'>('compact');
  readonly tone = input<'accent' | 'subtle'>('accent');
  readonly layout = input<'row' | 'stretch' | 'grid-3x2' | 'chips'>('row');
  readonly disabled = input<boolean>(false);

  protected readonly activeIndex = computed(() => this.options().findIndex((o) => o.value === this.value()));

  protected select(option: SegmentOption<T>): void {
    if (this.disabled() || option.disabled) return;
    this.value.set(option.value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const delta = keys[event.key];
    if (delta === undefined || this.disabled()) return;
    event.preventDefault();
    const enabled = this.options().filter((o) => !o.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((o) => o.value === this.value());
    const next = enabled[(current + delta + enabled.length) % enabled.length];
    if (next) {
      this.value.set(next.value);
      const host = event.currentTarget as HTMLElement;
      const buttons = host.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
      buttons[this.options().indexOf(next)]?.focus();
    }
  }
}
