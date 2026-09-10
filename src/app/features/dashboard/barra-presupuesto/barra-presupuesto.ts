import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatMoney } from '../../../core/format/money-format';
import { DASH, formatBasisPoints, formatPoints } from '../../../core/format/percent-format';
import type { BudgetPace } from '../../../domain/budget/budget.service';

/**
 * Barra «Presupuesto consumido» del handoff: pista de 10px, relleno en
 * `expense` al % consumido y marca del día actual (2px, sobresale 5px).
 * Pie: «Marca del día 9 de 30 — 30 % del mes transcurrido» y, a la derecha,
 * «Vas 38,5 puntos por delante del ritmo» en rojo (o por detrás, en verde).
 */
@Component({
  selector: 'ft-barra-presupuesto',
  templateUrl: './barra-presupuesto.html',
  styleUrl: './barra-presupuesto.scss',
  host: { '[class]': '"variante-" + variante()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarraPresupuesto {
  readonly pace = input.required<BudgetPace>();
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');

  protected readonly consumido = computed(() => formatBasisPoints(this.pace().consumedBp));
  protected readonly anchoRelleno = computed(() => Math.min(100, Math.max(0, (this.pace().consumedBp ?? 0) / 100)));
  protected readonly posicionMarca = computed(() => Math.min(100, Math.max(0, this.pace().elapsedBp / 100)));
  protected readonly baseTexto = computed(() => (this.pace().base === 'income' ? 'de los ingresos' : 'del presupuesto objetivo'));
  protected readonly restante = computed(() => {
    const r = this.pace().remaining;
    return r === null ? DASH : formatMoney(r);
  });
  protected readonly marcaTexto = computed(() => {
    const p = this.pace();
    return `Marca del día ${p.dayOfMonth} de ${p.daysInMonth} — ${formatBasisPoints(p.elapsedBp, { decimals: 0 })} del mes transcurrido`;
  });
  protected readonly ritmo = computed<{ readonly texto: string; readonly tono: 'expense' | 'income' | 'neutral' }>(() => {
    const bp = this.pace().pacePointsBp;
    if (bp === null) return { texto: 'Sin base de comparación', tono: 'neutral' };
    if (Math.abs(bp) < 50) return { texto: 'Vas al ritmo del mes', tono: 'neutral' };
    return bp > 0
      ? { texto: `Vas ${formatPoints(bp)} por delante del ritmo`, tono: 'expense' }
      : { texto: `Vas ${formatPoints(bp)} por detrás del ritmo`, tono: 'income' };
  });
  protected readonly ritmoCorto = computed(() => {
    const bp = this.pace().pacePointsBp;
    if (bp === null || Math.abs(bp) < 50) return 'al ritmo del mes';
    return bp > 0 ? 'por delante del ritmo' : 'por detrás del ritmo';
  });
}
