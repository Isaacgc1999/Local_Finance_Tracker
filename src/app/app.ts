import { ChangeDetectionStrategy, Component } from '@angular/core';

import { Shell } from './layout/shell/shell';

@Component({
  selector: 'ft-root',
  imports: [Shell],
  template: '<ft-shell />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
