import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';

/** Toggle del handoff: 44×26, r999, pista acento / borde, pastilla 20px blanca / text-3, padding 3. */
@Component({
  selector: 'ft-toggle',
  template: `
    <button
      type="button"
      role="switch"
      class="pista"
      [class.activo]="checked()"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label() || null"
      [attr.aria-labelledby]="labelledBy() || null"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      <span class="pastilla"></span>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    .pista {
      display: flex;
      align-items: center;
      width: var(--ft-toggle-w);
      height: var(--ft-toggle-h);
      padding: var(--ft-toggle-pad);
      border-radius: var(--ft-radius-pill);
      background: var(--ft-border);
      cursor: pointer;
    }
    .pista.activo {
      background: var(--ft-accent);
      justify-content: flex-end;
    }
    .pista:disabled {
      opacity: var(--ft-opacity-disabled-control);
      cursor: default;
    }
    .pastilla {
      width: var(--ft-toggle-knob);
      height: var(--ft-toggle-knob);
      border-radius: var(--ft-radius-pill);
      background: var(--ft-text-3);
    }
    .activo .pastilla {
      background: #ffffff;
    }
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Toggle), multi: true }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toggle implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly labelledBy = input<string>('');

  protected readonly checked = signal(false);
  protected readonly disabled = signal(false);

  private onChange: (value: boolean) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.checked.set(value === true);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected toggle(): void {
    if (this.disabled()) return;
    const next = !this.checked();
    this.checked.set(next);
    this.onChange(next);
    this.onTouched();
  }
}
