import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Panel deslizante del handoff: columna de 400px a la derecha en escritorio y
 * tablet (el contenido de detrás sigue montado, atenuado al 45 %), y hoja
 * modal con asa de 40×4 en móvil.
 *
 * No usa `<dialog>` a propósito: `showModal()` haría inerte el resto de la
 * página y el handoff exige que la vista de detrás siga visible y viva. El
 * foco entra al abrir, Escape cierra y el foco vuelve a quien lo abrió.
 */
@Component({
  selector: 'ft-panel-lateral',
  templateUrl: './panel-lateral.html',
  styleUrl: './panel-lateral.scss',
  host: {
    role: 'dialog',
    'aria-modal': 'false',
    '[attr.aria-label]': 'titulo()',
    '[class.hoja]': 'hoja()',
    '(keydown.escape)': 'onEscape($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelLateral {
  readonly titulo = input.required<string>();
  /** `true` en móvil: hoja modal anclada abajo con asa en vez de cabecera. */
  readonly hoja = input<boolean>(false);
  readonly cerrar = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly primero = viewChild<ElementRef<HTMLElement>>('primero');

  constructor() {
    // El foco entra en el panel en cuanto se pinta, para que Escape y el
    // teclado funcionen sin obligar a tabular desde el botón que lo abrió.
    afterRenderEffect(() => {
      const objetivo = this.primero()?.nativeElement ?? this.host.nativeElement;
      if (!this.host.nativeElement.contains(document.activeElement)) objetivo.focus({ preventScroll: true });
    });
  }

  protected onEscape(event: Event): void {
    event.stopPropagation();
    this.cerrar.emit();
  }

  protected onCerrar(): void {
    this.cerrar.emit();
  }
}
