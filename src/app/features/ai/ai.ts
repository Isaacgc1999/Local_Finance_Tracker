import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { describeError } from '../../core/errors/app-error';
import { formatMoney } from '../../core/format/money-format';
import { money } from '../../core/types/money';
import { AiFacade } from '../../facades/ai.facade';
import { BreakpointService } from '../../infra/platform/breakpoint.service';
import { EstadoVacio } from '../../shared/components/estado-vacio/estado-vacio';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { TarjetaError } from '../../shared/components/tarjeta-error/tarjeta-error';
import { CabeceraIa } from './cabecera-ia/cabecera-ia';
import { EstadoModelo } from './estado-modelo/estado-modelo';
import { PotencialAhorro } from './potencial-ahorro/potencial-ahorro';
import { TimelineInformes } from './timeline-informes/timeline-informes';

/**
 * Pantalla de Análisis IA (pantalla 4 del handoff). Cinco estados: Ollama no
 * detectado (con instrucciones), modelo no descargado, generando (streaming
 * visible), completado y fallido con las métricas locales de fallback.
 */
@Component({
  selector: 'ft-ai',
  imports: [CabeceraIa, TimelineInformes, PotencialAhorro, EstadoModelo, EstadoVacio, Skeleton, TarjetaError],
  templateUrl: './ai.html',
  styleUrl: './ai.scss',
  host: { class: 'ft-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ai {
  protected readonly facade = inject(AiFacade);
  protected readonly bp = inject(BreakpointService);
  private readonly router = inject(Router);

  protected readonly variante = computed(() => (this.bp.isMobile() ? 'mobile' : this.bp.isTablet() ? 'tablet' : 'desktop'));

  protected readonly errorTexto = computed(() => {
    const e = this.facade.error();
    return e ? describeError(e) : '';
  });

  /** Tarjeta de error de conexión: solo cuando el servicio no responde o falta el modelo. */
  protected readonly problema = computed(() => {
    const status = this.facade.modelStatus();
    if (status === 'not_detected') {
      return {
        titulo: `No se encuentra Ollama en ${this.facade.endpointLabel()}`,
        texto: 'Arranca el servicio (ollama serve) o cambia el endpoint en Ajustes. Los informes anteriores siguen disponibles.',
      };
    }
    if (status === 'model_missing') {
      return {
        titulo: `El modelo «${this.facade.settings().ollamaModel}» no está descargado`,
        texto: `Descárgalo con: ollama pull ${this.facade.settings().ollamaModel}. Los informes anteriores siguen disponibles.`,
      };
    }
    return null;
  });

  /** Métricas locales cuando el último informe falló: la app nunca se queda en blanco. */
  protected readonly fallbackMetricas = computed(() => {
    const s = this.facade.fallback();
    if (!s) return [];
    return [
      { label: 'Ingresos', valor: formatMoney(money(s.income_cents)) },
      { label: 'Gastos', valor: formatMoney(money(s.expenses_cents)) },
      { label: 'Balance', valor: formatMoney(money(s.balance_cents), { sign: 'always' }) },
      { label: 'Frente a la media de 4 semanas', valor: s.expenses_change_vs_avg_pct === null ? '—' : `${s.expenses_change_vs_avg_pct > 0 ? '+' : ''}${s.expenses_change_vs_avg_pct.toFixed(1).replace('.', ',')} %` },
    ];
  });

  protected readonly mostrarFallback = computed(() => {
    const ultimo = this.facade.reports()[0];
    return !!ultimo && ultimo.status === 'failed' && this.facade.fallback() !== null;
  });

  protected regenerar(): void {
    void this.facade.regenerate();
  }

  protected reintentar(): void {
    void this.facade.checkStatus().then(() => this.facade.regenerate());
  }

  protected irAAjustes(): void {
    void this.router.navigate(['/settings']);
  }
}
