import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { SemanticColor } from '../../../core/types/event';

export type KpiEstado = 'normal' | 'activo' | 'deshabilitada' | 'error';

/**
 * Tarjeta KPI con sparkline del handoff: punto de color + etiqueta 15/500,
 * importe 600/24, pie 13 en text-3 y sparkline SVG 100×28 (polyline 1,6px,
 * sin relleno, color semántico). Estados normal / hover / activo / foco /
 * deshabilitada («Sin datos del periodo») / error (borde y pie en `expense`).
 */
@Component({
  selector: 'ft-tarjeta-kpi',
  templateUrl: './tarjeta-kpi.html',
  styleUrl: './tarjeta-kpi.scss',
  host: {
    '[class]': '"estado-" + estado() + " color-" + color() + " valor-" + valueTone()',
    '[class.interactiva]': 'interactiva()',
    '[attr.role]': 'interactiva() ? "button" : null',
    '[attr.tabindex]': 'interactiva() && estado() !== "deshabilitada" ? 0 : null',
    '[attr.aria-pressed]': 'interactiva() ? estado() === "activo" : null',
    '(click)': 'onActivate()',
    '(keydown.enter)': 'onActivate()',
    '(keydown.space)': 'onActivate($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TarjetaKpi {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly foot = input<string>('');
  readonly color = input<SemanticColor>('neutral');
  /** Color del importe (fila de métricas de Analítica: verde, rojo, ámbar); `neutral` = text-1. */
  readonly valueTone = input<SemanticColor>('neutral');
  /** Oculta el punto de color de la cabecera (fila de métricas). */
  readonly sinPunto = input<boolean>(false);
  /** Serie de 6 valores (céntimos); vacío = sin sparkline. */
  readonly sparkline = input<readonly number[]>([]);
  readonly estado = input<KpiEstado>('normal');
  readonly interactiva = input<boolean>(false);
  /** Tamaño de la sparkline: `md` 100×28, `sm` 72×28, `full` ancho completo (móvil). */
  readonly sparklineSize = input<'md' | 'sm' | 'full'>('md');
  readonly activar = output<void>();

  /** Puntos «x,y» en un viewBox 100×28 con 2px de margen, como el prototipo. */
  protected readonly puntos = computed(() => {
    const values = this.sparkline();
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = 100 / (values.length - 1);
    return values
      .map((v, i) => {
        const x = Math.round(i * stepX * 10) / 10;
        const y = Math.round((26 - ((v - min) / span) * 22) * 10) / 10;
        return `${x},${y}`;
      })
      .join(' ');
  });

  protected onActivate(event?: Event): void {
    if (!this.interactiva() || this.estado() === 'deshabilitada') return;
    event?.preventDefault();
    this.activar.emit();
  }
}
