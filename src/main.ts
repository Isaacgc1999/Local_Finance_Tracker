import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { applyAppearance, readStoredAppearance } from './app/infra/platform/theme.service';

// El tema se aplica antes de arrancar Angular: si no, la app pintaría un
// instante en finance oscuro aunque el usuario tenga elegido otro.
applyAppearance(readStoredAppearance());

bootstrapApplication(App, appConfig).catch((err: unknown) => console.error(err));
