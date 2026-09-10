import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { keyFromKeyboard } from '../../domain/calculator/calculator-engine';
import { CalculatorFacade, type CalcTab } from '../../facades/calculator.facade';
import { BreakpointService } from '../../infra/platform/breakpoint.service';
import {
  SegmentedControl,
  type SegmentOption,
} from '../../shared/components/segmented-control/segmented-control';
import { DisplayCalc } from './display-calc/display-calc';
import { HistorialCalc } from './historial-calc/historial-calc';
import { PestanaFinanciera } from './pestana-financiera/pestana-financiera';
import { TecladoCalc } from './teclado-calc/teclado-calc';

const PESTANAS: readonly SegmentOption<CalcTab>[] = [
  { value: 'standard', label: 'Estándar' },
  { value: 'financial', label: 'Financiera' },
];

/**
 * Contenido de la calculadora (pantalla 5 del handoff). Se monta dentro de
 * `PanelLateral`, que a su vez cuelga del `Shell`: por eso abrirla no
 * desmonta la vista de detrás. Todo el estado vive en `CalculatorFacade`.
 */
@Component({
  selector: 'ft-calculadora',
  imports: [SegmentedControl, DisplayCalc, TecladoCalc, PestanaFinanciera, HistorialCalc],
  templateUrl: './calculadora.html',
  styleUrl: './calculadora.scss',
  host: {
    '[class.compacta]': 'compacta()',
    '(keydown)': 'onKeydown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Calculadora {
  protected readonly facade = inject(CalculatorFacade);
  private readonly bp = inject(BreakpointService);

  protected readonly pestanas = PESTANAS;
  protected readonly compacta = computed(() => this.bp.isMobile());

  /**
   * Teclado físico sobre la pestaña estándar. No se toca cuando el foco está
   * en un campo de texto (pestaña financiera) ni cuando hay modificadores:
   * Ctrl/Cmd+K sigue siendo del `Shell`.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (this.facade.tab() !== 'standard') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    // Espacio e Intro tienen que seguir activando el botón que tenga el foco.
    if (target instanceof HTMLButtonElement && (event.key === 'Enter' || event.key === ' ')) return;
    const key = keyFromKeyboard(event.key);
    if (key === null) return;
    event.preventDefault();
    this.facade.press(key);
  }
}
