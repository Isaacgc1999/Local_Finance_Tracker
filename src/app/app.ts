import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ThemeService } from './infra/platform/theme.service';
import { Shell } from './layout/shell/shell';

@Component({
  selector: 'ft-root',
  imports: [Shell],
  template: '<ft-shell />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    // Se crea al arrancar para publicar la paleta de los gráficos y seguir al
    // sistema en modo «Sistema», aunque nadie abra Ajustes.
    inject(ThemeService);
  }
}
