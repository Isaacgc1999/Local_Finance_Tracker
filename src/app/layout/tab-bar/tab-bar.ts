import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { Icono } from '../../shared/components/icono/icono';
import { NAV_ITEMS } from '../navegacion';

/** Tab bar inferior de 76px con los destinos de la navegación (README, layout de 640px o menos). */
@Component({
  selector: 'ft-tab-bar',
  imports: [RouterLink, RouterLinkActive, Icono],
  template: `
    <nav aria-label="Principal">
      @for (item of items; track item.id) {
        <a class="tab" [routerLink]="item.path" routerLinkActive="activo" ariaCurrentWhenActive="page">
          <ft-icono [name]="item.id" />
          <span>{{ item.tabLabel }}</span>
        </a>
      }
    </nav>
  `,
  styleUrl: './tab-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabBar {
  protected readonly items = NAV_ITEMS;
}
