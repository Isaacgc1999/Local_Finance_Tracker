import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Chip de categoría (hoja de componentes): 32px (36 móvil), r999, 500/13.
 * Normal `surface-elevated` + borde · hover `border` · activo acento sólido
 * (o `investment` con texto oscuro para el tipo de activo) · foco borde acento
 * + anillo · deshabilitado opacity .45 con nota · error borde y texto `expense`.
 */
@Component({
  selector: 'ft-chip-categoria',
  template: `
    <button
      type="button"
      class="chip"
      [class.activo]="selected()"
      [class.error]="error()"
      [attr.aria-pressed]="selected()"
      [disabled]="disabled()"
      (click)="toggle.emit()"
    >
      {{ label() }}
    </button>
    @if (nota()) {
      <span class="nota" [class.nota--error]="error()">{{ nota() }}</span>
    }
  `,
  styleUrl: './chip-categoria.scss',
  host: {
    '[class.tono-investment]': 'tone() === "investment"',
    '[class.deshabilitado]': 'disabled()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChipCategoria {
  readonly label = input.required<string>();
  readonly selected = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly error = input<boolean>(false);
  readonly nota = input<string>('');
  readonly tone = input<'accent' | 'investment'>('accent');
  readonly toggle = output<void>();
}
