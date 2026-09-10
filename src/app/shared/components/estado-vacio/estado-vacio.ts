import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type EstadoVacioVariant = 'sin-datos' | 'sin-resultados';

/**
 * Estado vacío ilustrado del handoff: caja punteada sobre superficie elevada.
 * `sin-datos` lleva el gráfico de 4 barras y un CTA primario;
 * `sin-resultados` lleva el círculo y un enlace («Limpiar filtros»).
 */
@Component({
  selector: 'ft-estado-vacio',
  templateUrl: './estado-vacio.html',
  styleUrl: './estado-vacio.scss',
  host: { '[class]': '"variant-" + variant()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstadoVacio {
  readonly variant = input<EstadoVacioVariant>('sin-datos');
  readonly titulo = input.required<string>();
  readonly texto = input<string>('');
  readonly accionLabel = input<string>('');
  readonly accion = output<void>();
}
