import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatMoney } from '../../../core/format/money-format';
import { DASH, formatBasisPoints, formatDelta } from '../../../core/format/percent-format';
import type { SemanticColor } from '../../../core/types/event';
import type { AnalyticsSnapshot } from '../../../domain/analytics/analytics.service';
import type { Granularity } from '../../../domain/analytics/periods';
import { TarjetaKpi } from '../../../shared/components/tarjeta-kpi/tarjeta-kpi';

interface Metrica {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly foot: string;
  readonly tone: SemanticColor;
  readonly span2?: boolean;
  /** Se oculta en 390 (el handoff muestra 4 tarjetas). */
  readonly ocultarMovil?: boolean;
}

const PERIOD_SHORT: Readonly<Record<Granularity, string>> = { day: 'd', week: 'sem.', month: 'm', year: 'a' };
const PERIOD_WORD: Readonly<Record<Granularity, string>> = { day: 'días', week: 'semanas', month: 'meses', year: 'años' };

/**
 * Fila de métricas del handoff (5 tarjetas): total ingresos (verde), total
 * gastos (rojo, «73,1 % de ingresos»), tasa de ahorro (ámbar, «objetivo 30 %»),
 * gasto medio diario («183 días») y varianza vs. media de 3 periodos, cuya
 * flecha y color codifican el signo (▼ verde = gastas menos).
 */
@Component({
  selector: 'ft-fila-metricas',
  imports: [TarjetaKpi],
  template: `
    @for (m of metricas(); track m.key) {
      @if (!(variante() === 'mobile' && m.ocultarMovil)) {
        <ft-tarjeta-kpi [class.span-2]="variante() === 'tablet' && m.span2" [label]="m.label" [value]="m.value" [foot]="variante() === 'desktop' ? m.foot : ''" [valueTone]="m.tone" [sinPunto]="true" />
      }
    }
  `,
  styleUrl: './fila-metricas.scss',
  host: { '[class]': '"variante-" + variante()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilaMetricas {
  readonly snapshot = input.required<AnalyticsSnapshot>();
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');

  protected readonly metricas = computed<readonly Metrica[]>(() => {
    const s = this.snapshot();
    const g = s.granularity;
    const n = s.periods.length;
    const delta = formatDelta(s.variance.deltaBp);
    const varianzaFoot =
      s.variance.deltaBp === null
        ? 'sin periodos previos'
        : s.variance.deltaBp < 0
          ? 'gastas menos que tu media'
          : s.variance.deltaBp > 0
            ? 'gastas más que tu media'
            : 'igual que tu media';
    return [
      { key: 'income', label: 'Total ingresos', value: formatMoney(s.income), foot: `${n} ${n === 1 ? 'periodo' : 'periodos'}`, tone: 'income' },
      {
        key: 'outflow',
        label: 'Total gastos',
        value: formatMoney(s.outflow),
        foot: s.outflowShareOfIncomeBp === null ? 'sin ingresos' : `${formatBasisPoints(s.outflowShareOfIncomeBp)} de ingresos`,
        tone: 'expense',
      },
      {
        key: 'savings',
        label: 'Tasa de ahorro',
        value: formatBasisPoints(s.savingsRateBp),
        foot: s.savingsTargetBp === null ? 'sin objetivo' : `objetivo ${formatBasisPoints(s.savingsTargetBp, { decimals: 0 })}`,
        tone: 'savings',
      },
      {
        key: 'daily',
        label: this.variante() === 'desktop' ? 'Gasto medio diario' : 'Medio diario',
        value: s.dailyAverage === null ? DASH : formatMoney(s.dailyAverage),
        foot: `${s.days} ${PERIOD_WORD.day}`,
        tone: 'neutral',
        ocultarMovil: true,
      },
      {
        key: 'variance',
        label: this.variante() === 'mobile' ? `Varianza 3 ${PERIOD_SHORT[g]}` : `Varianza vs. media 3 ${this.variante() === 'tablet' ? PERIOD_WORD[g] : PERIOD_SHORT[g]}`,
        value: delta.text,
        foot: varianzaFoot,
        tone: delta.tone,
        span2: true,
      },
    ];
  });
}
