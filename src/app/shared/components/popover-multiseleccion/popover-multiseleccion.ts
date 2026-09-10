import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
} from '@angular/core';

import { ChipCategoria } from '../chip-categoria/chip-categoria';
import { PillFiltro } from '../pill-filtro/pill-filtro';

export interface MultiOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Pill de filtro + popover de multiselección (propio; el handoff solo dibuja
 * la pill cerrada). Panel de 240px anclado bajo la pill, chips seleccionables,
 * «Limpiar», cierre con Escape o clic fuera.
 */
@Component({
  selector: 'ft-popover-multiseleccion',
  imports: [PillFiltro, ChipCategoria],
  templateUrl: './popover-multiseleccion.html',
  styleUrl: './popover-multiseleccion.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'cerrar()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PopoverMultiseleccion {
  readonly label = input.required<string>();
  readonly options = input.required<readonly MultiOption[]>();
  readonly selected = model<readonly string[]>([]);
  readonly open = model<boolean>(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly count = computed(() => this.selected().length);

  protected toggleOpen(): void {
    this.open.update((v) => !v);
  }

  protected cerrar(): void {
    this.open.set(false);
  }

  protected isSelected(value: string): boolean {
    return this.selected().includes(value);
  }

  protected toggle(value: string): void {
    const current = this.selected();
    this.selected.set(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  }

  protected limpiar(): void {
    this.selected.set([]);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.cerrar();
  }
}
