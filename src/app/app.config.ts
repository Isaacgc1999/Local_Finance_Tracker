import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  PreloadAllModules,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
  withViewTransitions,
} from '@angular/router';

import { routes } from './app.routes';

function leaf(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  while (route.firstChild) route = route.firstChild;
  return route;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // Todo se sirve desde disco: precargar los chunks en idle no cuesta red.
      withPreloading(PreloadAllModules),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      // Transición corta entre pantallas (ver `_animations.scss`). Si solo
      // cambian los query params o el :id (filtros de analítica, otro
      // movimiento), no hay transición: el contenido se actualiza en sitio.
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition, from, to }) => {
          if (leaf(from).routeConfig === leaf(to).routeConfig) transition.skipTransition();
        },
      }),
    ),
  ],
};
