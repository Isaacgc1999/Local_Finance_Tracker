import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import type { RutaData } from '../../app.routes';
import { describeError } from '../../core/errors/app-error';
import { formatBytes } from '../../core/format/bytes-format';
import { AppStatusFacade } from '../../facades/app-status.facade';
import { CalculatorFacade } from '../../facades/calculator.facade';
import { BreakpointService } from '../../infra/platform/breakpoint.service';
import { Calculadora } from '../../features/calculator/calculadora';
import { PanelLateral } from '../../shared/components/panel-lateral/panel-lateral';
import { PillEstado } from '../../shared/components/pill-estado/pill-estado';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { TarjetaError } from '../../shared/components/tarjeta-error/tarjeta-error';
import { Fab } from '../fab/fab';
import { Sidebar } from '../sidebar/sidebar';
import { TabBar } from '../tab-bar/tab-bar';

/**
 * Contenedor raíz: sidebar (240 / 64) + contenido, o tab bar + FAB en móvil.
 * Observa su propio ancho con ResizeObserver y lo publica en BreakpointService.
 * Arranca la base de datos y muestra skeleton / error hasta que está lista.
 */
@Component({
  selector: 'ft-shell',
  imports: [RouterOutlet, Sidebar, TabBar, Fab, Skeleton, TarjetaError, PillEstado, PanelLateral, Calculadora],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  host: {
    '[class.mobile]': 'bp.isMobile()',
    '[class.tablet]': 'bp.isTablet()',
    '[class.desktop]': 'bp.isDesktop()',
    '[class.con-fab]': 'fabVisible()',
    '[class.con-panel]': 'calc.open()',
    '(document:keydown)': 'onGlobalKeydown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly bp = inject(BreakpointService);
  protected readonly status = inject(AppStatusFacade);
  protected readonly calc = inject(CalculatorFacade);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly rutaData = signal<Partial<RutaData>>({});

  /** El FAB solo existe en móvil, con la BD lista y en las rutas que lo declaran. */
  protected readonly fabVisible = computed(
    () => this.bp.isMobile() && !this.calc.open() && this.status.boot() === 'ready' && this.rutaData().fab === true,
  );

  protected readonly dbNombre = computed(() => {
    const path = this.status.dbInfo()?.path;
    return path ? (path.split(/[\\/]/).pop() ?? 'fintrack.db') : 'fintrack.db';
  });

  protected readonly dbTamano = computed(() => {
    const info = this.status.dbInfo();
    return info ? formatBytes(info.bytes) : '—';
  });

  protected readonly bootErrorText = computed(() => {
    const e = this.status.bootError();
    return e ? describeError(e) : '';
  });

  constructor() {
    afterNextRender(() => {
      const stop = this.bp.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(stop);
    });

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.rutaData.set(this.leerRutaData()));

    void this.status.start();
  }

  /**
   * Ctrl/Cmd+K abre y cierra la calculadora desde cualquier ruta. Se escucha
   * en el documento (no en window) para que también funcione con el foco
   * dentro del propio panel, y se ignora si el navegador ya lo consumió.
   */
  protected onGlobalKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key !== 'k' && event.key !== 'K') return;
    event.preventDefault();
    this.calc.toggle();
  }

  protected async usarImporte(): Promise<void> {
    await this.calc.useInNewEvent();
  }

  protected reintentar(): void {
    void this.status.retry();
  }

  private leerRutaData(): Partial<RutaData> {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.data as Partial<RutaData>;
  }
}
