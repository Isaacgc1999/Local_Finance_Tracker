import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { describeError } from '../../core/errors/app-error';
import { formatDayMonthYear } from '../../core/format/date-format';
import { formatMoney } from '../../core/format/money-format';
import { formatBasisPoints } from '../../core/format/percent-format';
import { CONTRIBUTION_FREQUENCIES, FREQUENCY_LABEL, FREQUENCY_PER, GOAL_KIND_LABEL, type Goal } from '../../core/types/goal';
import { type Money, ZERO } from '../../core/types/money';
import { type GoalView, GoalsFacade } from '../../facades/goals.facade';
import { CabeceraPagina } from '../../layout/cabecera-pagina/cabecera-pagina';
import { EstadoVacio } from '../../shared/components/estado-vacio/estado-vacio';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { TarjetaError } from '../../shared/components/tarjeta-error/tarjeta-error';
import { HEALTH_LABEL, healthText, timeLeftLong, timeLeftShort } from './goal-format';
import { type Aportacion, ModalAportar } from './modal-aportar';
import { ModalObjetivo } from './modal-objetivo';

/**
 * Objetivos: ahorrar, comprar algo sin financiar, invertir, un viaje…
 * Cada tarjeta dice cuánto falta, cuánto tiempo queda (días, meses y años) y
 * cuánto apartar al día, a la semana, al mes y al año; si vas por delante o
 * por detrás del plan; y arriba, si todos juntos caben en lo que ahorras.
 */
@Component({
  selector: 'ft-goals',
  imports: [CabeceraPagina, EstadoVacio, Skeleton, TarjetaError, ModalObjetivo, ModalAportar],
  templateUrl: './goals.html',
  styleUrl: './goals.scss',
  host: { class: 'ft-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Goals {
  protected readonly facade = inject(GoalsFacade);

  protected readonly modalObjetivo = signal(false);
  protected readonly enEdicion = signal<Goal | null>(null);
  protected readonly ahorradoEdicion = signal<Money>(ZERO);
  protected readonly modalAportar = signal(false);
  protected readonly aportarA = signal<GoalView | null>(null);

  protected readonly frecuencias = CONTRIBUTION_FREQUENCIES;
  protected readonly freqLabel = FREQUENCY_LABEL;
  protected readonly perLabel = FREQUENCY_PER;
  protected readonly kindLabel = GOAL_KIND_LABEL;
  protected readonly healthLabel = HEALTH_LABEL;

  protected readonly errorTexto = computed(() => {
    const e = this.facade.error();
    return e ? describeError(e) : '';
  });

  protected readonly resumen = computed(() => {
    const t = this.facade.totals();
    const cap = this.facade.capacity();
    const fit = this.facade.fit();
    const need = formatMoney(t.monthlyNeed);
    const texto =
      fit === 'unknown'
        ? `Necesitas apartar ${need} al mes entre todos. Cuando haya ${this.facade.capacityMonths} meses de movimientos te diré si te cabe.`
        : fit === 'over'
          ? `Necesitas ${need} al mes y ahorras de media ${formatMoney(cap ?? ZERO)}: no te cabe. Alarga alguna fecha o baja algún importe.`
          : fit === 'tight'
            ? `Necesitas ${need} al mes de los ${formatMoney(cap ?? ZERO)} que ahorras de media: cabe, pero muy justo.`
            : `Necesitas ${need} al mes y ahorras de media ${formatMoney(cap ?? ZERO)}: te cabe con margen.`;
    return {
      objetivo: formatMoney(t.target),
      ahorrado: formatMoney(t.saved),
      progreso: t.target > 0 ? Math.min(100, (t.saved / t.target) * 100) : 0,
      necesidad: need,
      capacidad: cap === null ? '—' : formatMoney(cap),
      fit,
      texto,
    };
  });

  protected money(v: Money): string {
    return formatMoney(v);
  }

  protected fecha(v: GoalView): string {
    return formatDayMonthYear(v.goal.targetDate);
  }

  protected tiempo(v: GoalView): string {
    return timeLeftShort(v.plan.timeLeft);
  }

  protected tiempoLargo(v: GoalView): string {
    return timeLeftLong(v.plan.timeLeft);
  }

  protected salud(v: GoalView): string {
    return healthText(v.plan.health, v.plan.vsPlan, v.plan.remaining);
  }

  protected pct(v: GoalView): string {
    return formatBasisPoints(v.plan.progressBp, { decimals: 0 });
  }

  protected nuevo(): void {
    this.enEdicion.set(null);
    this.ahorradoEdicion.set(ZERO);
    this.modalObjetivo.set(true);
  }

  protected editar(v: GoalView): void {
    this.enEdicion.set(v.goal);
    this.ahorradoEdicion.set(v.plan.saved);
    this.modalObjetivo.set(true);
  }

  protected aportar(v: GoalView): void {
    this.aportarA.set(v);
    this.modalAportar.set(true);
  }

  protected async guardarAportacion(a: Aportacion): Promise<void> {
    const v = this.aportarA();
    if (v) await this.facade.contribute(v.goal.id, a.amount, a.date, a.note);
  }

  protected conseguido(v: GoalView): void {
    void this.facade.setStatus(v.goal.id, 'achieved');
  }

  protected archivar(v: GoalView): void {
    void this.facade.setStatus(v.goal.id, 'archived');
  }

  protected reactivar(v: GoalView): void {
    void this.facade.setStatus(v.goal.id, 'active');
  }
}
