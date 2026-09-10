import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';

import { currencySymbol, formatAmount, parseMoney } from '../../../core/format/money-format';
import type { SemanticColor } from '../../../core/types/event';
import type { Money } from '../../../core/types/money';

/**
 * Input de importe del handoff: «€» a la izquierda en 600/24 text-3, cifra
 * 700/40 tabular, 72px (80 móvil, 56 compacto). Estados: normal («0,00» en
 * text-3), foco (borde del color del tipo + anillo), deshabilitado (.45) y
 * error (borde `expense` + mensaje). ControlValueAccessor sobre `Money | null`.
 */
@Component({
  selector: 'ft-input-importe',
  templateUrl: './input-importe.html',
  styleUrl: './input-importe.scss',
  host: {
    '[class]': '"tono-" + tone() + " size-" + size()',
    '[class.con-error]': '!!mensajeError()',
    '[class.deshabilitado]': 'disabled()',
  },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => InputImporte), multi: true }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputImporte implements ControlValueAccessor {
  readonly inputId = input<string>('importe');
  readonly tone = input<SemanticColor>('accent');
  readonly size = input<'lg' | 'md'>('lg');
  /** Error externo (validación del formulario). */
  readonly error = input<string>('');
  readonly ariaLabel = input<string>('Importe');

  protected readonly text = signal('');
  protected readonly disabled = signal(false);
  private readonly parseError = signal('');

  protected readonly mensajeError = computed(() => this.error() || this.parseError());
  /** Símbolo de la moneda activa (Ajustes → Moneda y formato). */
  protected readonly simbolo = computed(() => currencySymbol());

  private onChange: (value: Money | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.parseError.set('');
    this.text.set(typeof value === 'number' && Number.isSafeInteger(value) ? formatAmount(value as Money, 'never') : '');
  }

  registerOnChange(fn: (value: Money | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.text.set(raw);
    this.parseError.set('');
    if (raw.trim() === '') {
      this.onChange(null);
      return;
    }
    const parsed = parseMoney(raw);
    this.onChange(parsed.ok ? parsed.value : null);
  }

  protected onBlur(): void {
    this.onTouched();
    const raw = this.text().trim();
    if (raw === '') return;
    const parsed = parseMoney(raw);
    if (parsed.ok) {
      this.text.set(formatAmount(parsed.value, 'never'));
    } else {
      this.parseError.set('Importe no válido.');
    }
  }
}
