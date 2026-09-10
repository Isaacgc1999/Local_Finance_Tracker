import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { describeError } from '../../core/errors/app-error';
import { formatMonthYear } from '../../core/format/date-format';
import { CalculatorFacade } from '../../facades/calculator.facade';
import { DashboardFacade } from '../../facades/dashboard.facade';
import { BreakpointService } from '../../infra/platform/breakpoint.service';
import { CabeceraPagina } from '../../layout/cabecera-pagina/cabecera-pagina';
import { EstadoVacio } from '../../shared/components/estado-vacio/estado-vacio';
import { SelectorMes } from '../../shared/components/selector-mes/selector-mes';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { TarjetaError } from '../../shared/components/tarjeta-error/tarjeta-error';
import { TarjetaKpi } from '../../shared/components/tarjeta-kpi/tarjeta-kpi';
import { BarraPresupuesto } from './barra-presupuesto/barra-presupuesto';
import { DesgloseTipoGasto } from './desglose-tipo-gasto/desglose-tipo-gasto';
import { GastoPorSemana } from './gasto-por-semana/gasto-por-semana';
import { HeroBalance } from './hero-balance/hero-balance';
import { MovimientosRecientes } from './movimientos-recientes/movimientos-recientes';
import { ProximosCargos } from './proximos-cargos/proximos-cargos';

/**
 * Dashboard del mes en curso (pantalla 1 del handoff). Todo se deriva de
 * `DashboardFacade`; cambiar de mes recalcula hero, KPI, presupuesto,
 * gráficos y listas. Tres layouts reales: 12 columnas, 768 y 390.
 */
@Component({
  selector: 'ft-dashboard',
  imports: [
    RouterLink,
    CabeceraPagina,
    SelectorMes,
    HeroBalance,
    TarjetaKpi,
    BarraPresupuesto,
    GastoPorSemana,
    DesgloseTipoGasto,
    ProximosCargos,
    MovimientosRecientes,
    EstadoVacio,
    Skeleton,
    TarjetaError,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  host: { class: 'ft-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly facade = inject(DashboardFacade);
  protected readonly bp = inject(BreakpointService);
  private readonly calc = inject(CalculatorFacade);
  private readonly router = inject(Router);

  protected readonly variante = computed(() => (this.bp.isMobile() ? 'mobile' : this.bp.isTablet() ? 'tablet' : 'desktop'));
  protected readonly mesLabel = computed(() => formatMonthYear(this.facade.month()).toLowerCase());
  protected readonly errorTexto = computed(() => {
    const e = this.facade.error();
    return e ? describeError(e) : '';
  });

  protected abrirCalculadora(): void {
    this.calc.openPanel();
  }

  protected nuevoEvento(): void {
    void this.router.navigate(['/events/new']);
  }
}
