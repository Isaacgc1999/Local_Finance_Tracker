import { Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

/**
 * `<div [scrollEnd]="clave">`: lleva el scroll horizontal al final (lo más
 * reciente) tras el render, y otra vez cada vez que cambia la clave. Mientras
 * la clave no cambie, respeta la posición a la que el usuario haya movido el
 * scroll.
 */
@Directive({ selector: '[scrollEnd]' })
export class ScrollEndDirective {
  readonly scrollEnd = input<unknown>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect(() => {
      this.scrollEnd();
      const el = this.host.nativeElement;
      el.scrollLeft = el.scrollWidth;
    });
  }
}
