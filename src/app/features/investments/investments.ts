import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { describeError } from '../../core/errors/app-error';
import { formatDayMonthYear } from '../../core/format/date-format';
import { formatMoney } from '../../core/format/money-format';
import { formatBasisPoints } from '../../core/format/percent-format';
import { HOLDING_CLASS_LABEL, type HoldingClass, type Investment } from '../../core/types/investment';
import { daysBetween } from '../../core/types/iso-date';
import type { Money } from '../../core/types/money';
import type { Holding } from '../../domain/investments/portfolio';
import { InvestmentsFacade } from '../../facades/investments.facade';
import { CabeceraPagina } from '../../layout/cabecera-pagina/cabecera-pagina';
import { FT_COLORS } from '../../shared/charts/palette';
import { GraficoEvolucion } from '../../shared/components/grafico-evolucion/grafico-evolucion';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { TarjetaError } from '../../shared/components/tarjeta-error/tarjeta-error';
import { ModalInversion } from './modal-inversion';
import { ModalValor } from './modal-valor';

/** Días sin actualizar a partir de los que una posición se marca como desfasada. */
const STALE_DAYS = 30;

/**
 * Inversiones con valor actualizado a mano: total, rentabilidad, reparto
 * por tipo, evolución del valor frente a lo invertido y cada posición con
 * su peso y la fecha de su último valor.
 */
@Component({
  selector: 'ft-investments',
  imports: [CabeceraPagina, GraficoEvolucion, Skeleton, TarjetaError, ModalInversion, ModalValor],
  templateUrl: './investments.html',
  styleUrl: './investments.scss',
  host: { class: 'ft-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Investments {
  protected readonly facade = inject(InvestmentsFacade);

  protected readonly classLabel = HOLDING_CLASS_LABEL;
  protected readonly color = FT_COLORS.investment;

  protected readonly modalInversion = signal(false);
  protected readonly enEdicion = signal<Investment | null>(null);
  protected readonly modalValor = signal(false);
  protected readonly valorDe = signal<Holding | null>(null);

  protected readonly errorTexto = computed(() => {
    const e = this.facade.error();
    return e ? describeError(e) : '';
  });

  /** Reparto del valor por tipo de activo para la barra apilada. */
  protected readonly reparto = computed(() => {
    const p = this.facade.portfolio();
    const byClass = new Map<HoldingClass, number>();
    for (const h of p.holdings) byClass.set(h.investment.assetClass, (byClass.get(h.investment.assetClass) ?? 0) + h.marketValue);
    return [...byClass.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, total], i) => ({
        kind,
        label: HOLDING_CLASS_LABEL[kind],
        total: formatMoney(total as Money),
        pct: p.marketValue > 0 ? (total / p.marketValue) * 100 : 0,
        color: FT_COLORS.series[i % FT_COLORS.series.length] ?? FT_COLORS.investment,
      }));
  });

  protected readonly desfasadas = computed(() => this.facade.portfolio().holdings.filter((h) => this.desfasada(h)).length);

  protected money(v: Money): string {
    return formatMoney(v);
  }

  protected signed(v: Money): string {
    return formatMoney(v, { sign: 'always' });
  }

  protected pct(bp: number | null, sign = false): string {
    return formatBasisPoints(bp, { decimals: 1, sign: sign ? 'always' : 'auto' });
  }

  protected desfasada(h: Holding): boolean {
    return h.lastUpdate !== null && daysBetween(h.lastUpdate, this.facade.today()) > STALE_DAYS;
  }

  protected actualizado(h: Holding): string {
    if (!h.lastUpdate) return 'Sin valor';
    const dias = daysBetween(h.lastUpdate, this.facade.today());
    if (dias <= 0) return 'Actualizado hoy';
    if (dias === 1) return 'Actualizado ayer';
    if (dias <= STALE_DAYS) return `Actualizado hace ${dias} días`;
    return `Sin actualizar desde el ${formatDayMonthYear(h.lastUpdate)}`;
  }

  /** Variación desde la valoración anterior, descontando lo aportado entre medias. */
  protected desdeAnterior(h: Holding): Money | null {
    if (!h.latest || !h.previous) return null;
    const ganancia = h.latest.marketValueCents - h.latest.investedCents - (h.previous.marketValueCents - h.previous.investedCents);
    return ganancia as Money;
  }

  protected nueva(): void {
    this.enEdicion.set(null);
    this.modalInversion.set(true);
  }

  protected editar(i: Investment): void {
    this.enEdicion.set(i);
    this.modalInversion.set(true);
  }

  protected actualizar(h: Holding): void {
    this.valorDe.set(h);
    this.modalValor.set(true);
  }
}
