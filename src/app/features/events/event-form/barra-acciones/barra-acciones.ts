import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Barra inferior fija del formulario (handoff): `surface`, borde superior,
 * padding 16px 32px. Izquierda «Guardar y añadir otro» en acento; derecha
 * «Cancelar» y «Guardar». En móvil, dos botones apilados de 48px.
 */
@Component({
  selector: 'ft-barra-acciones',
  templateUrl: './barra-acciones.html',
  styleUrl: './barra-acciones.scss',
  host: { '[class.movil]': 'mobile()', '[class.edicion]': 'editing()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarraAcciones {
  readonly mobile = input<boolean>(false);
  readonly editing = input<boolean>(false);
  readonly saving = input<boolean>(false);
  readonly guardar = output<void>();
  readonly guardarYOtro = output<void>();
  readonly cancelar = output<void>();
  readonly eliminar = output<void>();
}
