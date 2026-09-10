import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

/**
 * Modal del handoff (480px, r12, padding 24, título 600/24, subtítulo 13/1.5,
 * ✕ de 32px, botonera a la derecha). Usa `<dialog>` nativo: foco atrapado,
 * Escape y clic en el fondo cierran.
 */
@Component({
  selector: 'ft-modal',
  templateUrl: './modal.html',
  styleUrl: './modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Modal {
  readonly open = model<boolean>(false);
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string>('');
  readonly cerrar = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open()) {
        if (!el.open) el.showModal();
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected close(): void {
    this.open.set(false);
    this.cerrar.emit();
  }
}
