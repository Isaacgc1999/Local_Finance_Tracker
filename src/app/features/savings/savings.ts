import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { describeError } from '../../core/errors/app-error';
import { formatDayMonth } from '../../core/format/date-format';
import { formatMoney } from '../../core/format/money-format';
import { formatBasisPoints } from '../../core/format/percent-format';
import type { Money } from '../../core/types/money';
import { POT_KIND_HINT, POT_KIND_LABEL, type SavingsPot } from '../../core/types/savings';
import type { PotFlow } from '../../domain/savings/pot-balances';
import { type PotView, SavingsFacade } from '../../facades/savings.facade';
import { CabeceraPagina } from '../../layout/cabecera-pagina/cabecera-pagina';
import { FT_COLORS } from '../../shared/charts/palette';
import { GraficoEvolucion } from '../../shared/components/grafico-evolucion/grafico-evolucion';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { TarjetaError } from '../../shared/components/tarjeta-error/tarjeta-error';
import { type Aportacion, ModalAportar } from '../goals/modal-aportar';
import { ModalHucha } from './modal-hucha';

/**
 * Ahorros por tipo: fondo de emergencia, ahorro general y ahorro específico
 * (una hucha por objetivo). Total por sección, total conjunto y la evolución
 * de la bolsa de ahorro por días, meses o años.
 */
@Component({
  selector: 'ft-savings',
  imports: [RouterLink, CabeceraPagina, GraficoEvolucion, Skeleton, TarjetaError, ModalAportar, ModalHucha],
  templateUrl: './savings.html',
  styleUrl: './savings.scss',
  host: { class: 'ft-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Savings {
  protected readonly facade = inject(SavingsFacade);

  protected readonly kindLabel = POT_KIND_LABEL;
  protected readonly kindHint = POT_KIND_HINT;
  protected readonly color = computed(() => FT_COLORS.savings);

  protected readonly modalAportar = signal(false);
  protected readonly aportarA = signal<PotView | null>(null);
  protected readonly modalHucha = signal(false);
  protected readonly enEdicion = signal<SavingsPot | null>(null);

  protected readonly errorTexto = computed(() => {
    const e = this.facade.error();
    return e ? describeError(e) : '';
  });

  protected readonly total = computed(() => formatMoney(this.facade.total()));
  protected readonly variacion = computed(() => this.facade.last30());

  /** Reparto del total por sección para la barra apilada. */
  protected readonly reparto = computed(() => {
    const total = this.facade.total();
    return this.facade.groups().map((g) => ({
      kind: g.kind,
      label: POT_KIND_LABEL[g.kind],
      total: formatMoney(g.total),
      pct: total > 0 ? Math.max(0, (g.total / total) * 100) : 0,
      color: g.kind === 'emergency' ? FT_COLORS.expense : g.kind === 'general' ? FT_COLORS.savings : FT_COLORS.subscription,
    }));
  });

  /** «Cubre 4,2 meses de gastos» para el fondo de emergencia. */
  protected cobertura(v: PotView): string {
    const avg = this.facade.avgOutflow();
    if (v.pot.kind !== 'emergency' || !avg || avg <= 0) return '';
    const meses = v.balance / avg;
    const texto = meses.toLocaleString('es-ES', { maximumFractionDigits: 1 });
    const consejo = meses < 3 ? ' · lo recomendable son 3–6' : meses > 6 ? ' · por encima de 6, valora invertir el exceso' : ' · en el rango recomendado';
    return `Cubre ${texto} meses de gastos${consejo}`;
  }

  protected money(v: Money): string {
    return formatMoney(v);
  }

  protected signed(v: number): string {
    return formatMoney(v as Money, { sign: 'always' });
  }

  protected pct(bp: number | null): string {
    return formatBasisPoints(bp, { decimals: 0 });
  }

  protected flujo(f: PotFlow): string {
    return `${formatDayMonth(f.date)} · ${f.label}`;
  }

  protected aportar(v: PotView): void {
    this.aportarA.set(v);
    this.modalAportar.set(true);
  }

  protected async guardarAportacion(a: Aportacion): Promise<void> {
    const v = this.aportarA();
    if (v) await this.facade.addEntry(v.pot.id, a.amount, a.date, a.note);
  }

  protected nueva(): void {
    this.enEdicion.set(null);
    this.modalHucha.set(true);
  }

  protected editar(v: PotView): void {
    this.enEdicion.set(v.pot);
    this.modalHucha.set(true);
  }
}
