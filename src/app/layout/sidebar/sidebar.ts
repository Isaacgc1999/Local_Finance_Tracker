import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { Icono } from '../../shared/components/icono/icono';
import { NAV_ITEMS } from '../navegacion';

/**
 * Sidebar del handoff (Sidebar.dc.html): 240px con etiquetas y tarjeta de
 * estado del fichero, o 64px solo con iconos cuando `collapsed`.
 */
@Component({
  selector: 'ft-sidebar',
  imports: [RouterLink, RouterLinkActive, Icono],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  host: { '[class.collapsed]': 'collapsed()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  readonly collapsed = input<boolean>(false);
  /** Estado del fichero de datos; se alimenta con datos reales en Fase 2. */
  readonly dbNombre = input<string>('fintrack.db');
  readonly dbTamano = input<string>('—');

  protected readonly items = NAV_ITEMS;
}
