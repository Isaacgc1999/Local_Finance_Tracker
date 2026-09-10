import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { formatAmount } from '../../../core/format/money-format';
import type { HistoryEntry } from '../../../domain/calculator/calculator-engine';

/**
 * Historial del handoff: filas `surface-elevated` r8 con la operación en
 * text-2 13/1 y el resultado en text-1 600/15 tabular. Cada fila se reutiliza
 * con un toque; el enlace «Borrar» vacía la lista.
 */
@Component({
  selector: 'ft-historial-calc',
  template: `
    <div class="cabecera">
      <h3 class="titulo">Historial</h3>
      @if (entradas().length > 0) {
        <button type="button" class="ft-link" (click)="borrar.emit()">Borrar</button>
      }
    </div>

    @for (entrada of entradas(); track entrada.id) {
      <button type="button" class="fila" (click)="reutilizar.emit(entrada)">
        <span class="operacion num">{{ entrada.expression }}</span>
        <span class="resultado num">{{ importe(entrada) }}</span>
      </button>
    } @empty {
      <p class="vacio">Todavía no hay operaciones. Las que hagas aparecerán aquí para reutilizarlas.</p>
    }
  `,
  styleUrl: './historial-calc.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistorialCalc {
  readonly entradas = input.required<readonly HistoryEntry[]>();
  readonly reutilizar = output<HistoryEntry>();
  readonly borrar = output<void>();

  protected importe(entrada: HistoryEntry): string {
    return formatAmount(entrada.result, 'auto');
  }
}
