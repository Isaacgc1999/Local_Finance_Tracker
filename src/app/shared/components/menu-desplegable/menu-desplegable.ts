import { ChangeDetectionStrategy, Component, ElementRef, inject, input, model, output } from '@angular/core';

export interface MenuItem<T extends string = string> {
  readonly value: T;
  readonly label: string;
  /** Texto secundario a la derecha («.xlsx»). */
  readonly hint?: string;
}

/**
 * Menú desplegable del handoff (Exportar ▾): caja de 212px `surface-elevated`,
 * r12, padding 6px, opciones 15/500 con hover `border`, anclado bajo el
 * disparador con `z-index: 5`. Escape y clic fuera cierran; flechas navegan.
 */
@Component({
  selector: 'ft-menu-desplegable',
  templateUrl: './menu-desplegable.html',
  styleUrl: './menu-desplegable.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'cerrar()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuDesplegable<T extends string = string> {
  readonly items = input.required<readonly MenuItem<T>[]>();
  readonly label = input.required<string>();
  readonly open = model<boolean>(false);
  readonly align = input<'left' | 'right'>('right');
  readonly compact = input<boolean>(false);
  readonly seleccionar = output<T>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
  }

  protected cerrar(): void {
    this.open.set(false);
  }

  protected elegir(value: T): void {
    this.cerrar();
    this.seleccionar.emit(value);
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = items[(idx + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      next?.focus();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.cerrar();
  }
}
