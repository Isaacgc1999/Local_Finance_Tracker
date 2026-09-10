import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { describeError } from '../../core/errors/app-error';
import { AnalyticsFacade, type ExportOptions } from '../../facades/analytics.facade';
import { AppStatusFacade } from '../../facades/app-status.facade';
import { BreakpointService } from '../../infra/platform/breakpoint.service';
import { EstadoVacio } from '../../shared/components/estado-vacio/estado-vacio';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { TarjetaError } from '../../shared/components/tarjeta-error/tarjeta-error';
import { BarraFiltros } from './barra-filtros/barra-filtros';
import { FilaMetricas } from './fila-metricas/fila-metricas';
import { GraficoComparativo } from './grafico-comparativo/grafico-comparativo';
import { GraficoSaldo } from './grafico-saldo/grafico-saldo';
import { ModalExportar } from './modal-exportar/modal-exportar';
import { ProgresoPresupuestos } from './progreso-presupuestos/progreso-presupuestos';
import { TablaCategorias } from './tabla-categorias/tabla-categorias';

/**
 * Pantalla de Analítica (pantalla 3 del handoff). Todo lo que se muestra sale
 * del `AnalyticsSnapshot` puro; cambiar granularidad, rango, categorías o
 * tipos recalcula métricas, ambos gráficos y la tabla.
 */
@Component({
  selector: 'ft-analytics',
  imports: [
    BarraFiltros,
    FilaMetricas,
    GraficoComparativo,
    GraficoSaldo,
    ProgresoPresupuestos,
    TablaCategorias,
    ModalExportar,
    EstadoVacio,
    Skeleton,
    TarjetaError,
  ],
  templateUrl: './analytics.html',
  styleUrl: './analytics.scss',
  host: { class: 'ft-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Analytics {
  protected readonly facade = inject(AnalyticsFacade);
  protected readonly bp = inject(BreakpointService);
  private readonly status = inject(AppStatusFacade);

  protected readonly variante = computed(() => (this.bp.isMobile() ? 'mobile' : this.bp.isTablet() ? 'tablet' : 'desktop'));
  protected readonly errorTexto = computed(() => {
    const e = this.facade.error();
    return e ? describeError(e) : '';
  });

  protected async exportar(options: ExportOptions): Promise<void> {
    const result = await this.facade.runExport(options);
    if (!result.ok) {
      this.status.notify(describeError(result.error), 'expense');
      return;
    }
    this.facade.exportModalOpen.set(false);
    if (result.value) this.status.notify(`Guardado en ${result.value}`, 'income');
  }
}
