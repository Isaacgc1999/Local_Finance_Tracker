import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BarSeriesOption } from 'echarts/charts';

import { formatMoney } from '../../../core/format/money-format';
import type { AnalyticsSnapshot } from '../../../domain/analytics/analytics.service';
import type { Granularity } from '../../../domain/analytics/periods';
import type { FtChartOption } from '../../../shared/charts/echarts';
import { FT_COLORS, FT_FONT, FT_TOOLTIP, tooltipRow, tooltipTitle } from '../../../shared/charts/palette';
import { ChartDirective } from '../../../shared/directives/chart.directive';
import { ScrollEndDirective } from '../../../shared/directives/scroll-end.directive';
import { VISIBLE_PERIODS, chartWidthPercent } from '../chart-window';

const TITLE: Readonly<Record<Granularity, string>> = {
  day: 'Ingresos · Gastos · Inversión por día',
  week: 'Ingresos · Gastos · Inversión por semana',
  month: 'Ingresos · Gastos · Inversión por mes',
  year: 'Ingresos · Gastos · Inversión por año',
};

/**
 * Gráfico comparativo del handoff: barras agrupadas de 22px (16 en tablet y
 * móvil) por periodo en el orden Ingresos / Gastos / Inversión, r4 arriba,
 * leyenda en la cabecera y tooltip de 196px. Si hay más periodos de los que
 * caben (`VISIBLE_PERIODS`), scroll horizontal que arranca en los más
 * recientes; en móvil, 92px por periodo como en el handoff.
 */
@Component({
  selector: 'ft-grafico-comparativo',
  imports: [ChartDirective, ScrollEndDirective],
  templateUrl: './grafico-comparativo.html',
  styleUrl: './grafico-comparativo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficoComparativo {
  readonly snapshot = input.required<AnalyticsSnapshot>();
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');

  protected readonly titulo = computed(() => (this.variante() === 'desktop' ? TITLE[this.snapshot().granularity] : 'Comparativa'));
  protected readonly leyenda = computed(() => {
    const corta = this.variante() !== 'desktop';
    return [
      { label: corta ? 'Ing.' : 'Ingresos', color: FT_COLORS.income },
      { label: corta ? 'Gas.' : 'Gastos', color: FT_COLORS.expense },
      { label: corta ? 'Inv.' : 'Inversión', color: FT_COLORS.investment },
    ];
  });

  /** Ancho del gráfico dentro del contenedor con scroll; `null` = el del contenedor. */
  protected readonly ancho = computed(() => {
    const s = this.snapshot();
    const n = Math.max(1, s.periods.length);
    if (this.variante() === 'mobile') return `${n * 92}px`;
    const pct = chartWidthPercent(n, VISIBLE_PERIODS[s.granularity]);
    return pct === null ? null : `${pct}%`;
  });

  /** Al cambiar la granularidad o el rango, el scroll vuelve a lo más reciente. */
  protected readonly vista = computed(() => {
    const s = this.snapshot();
    return `${s.granularity}|${s.range.from}|${s.range.to}|${this.variante()}`;
  });

  protected readonly option = computed<FtChartOption>(() => {
    const periods = this.snapshot().periods;
    const barWidth = this.variante() === 'desktop' ? 22 : 16;
    const serie = (name: string, color: string, pick: (i: number) => number): BarSeriesOption => ({
      name,
      type: 'bar',
      barWidth,
      barMaxWidth: barWidth,
      barGap: '18%',
      barCategoryGap: '30%',
      itemStyle: { color, borderRadius: [4, 4, 0, 0] },
      emphasis: { disabled: true },
      data: periods.map((_, i) => pick(i)),
    });
    const option: FtChartOption = {
      animation: false,
      grid: { left: 8, right: 8, top: 12, bottom: 28, containLabel: false },
      xAxis: {
        type: 'category',
        data: periods.map((p) => p.label),
        axisLine: { show: false },
        axisTick: { show: false },
        // 'auto' oculta etiquetas solo si se pisan: en pantalla caben todas
        // (cada periodo tiene su franja) y en la exportación, que dibuja el
        // rango entero en el ancho visible, no se amontonan.
        axisLabel: { color: FT_COLORS.text3, fontFamily: FT_FONT, fontSize: 13, margin: 14, interval: 'auto' },
      },
      yAxis: { type: 'value', show: false },
      tooltip: {
        ...FT_TOOLTIP,
        // Fuera del contenedor con scroll, que si no lo recortaría.
        appendTo: 'body',
        trigger: 'axis',
        axisPointer: { type: 'none' },
        formatter: (params) => {
          const list = Array.isArray(params) ? params : [params];
          const first = list[0] as { dataIndex?: number } | undefined;
          const p = periods[first?.dataIndex ?? 0];
          if (!p) return '';
          return (
            tooltipTitle(p.longLabel) +
            tooltipRow(FT_COLORS.income, 'Ingresos', formatMoney(p.income)) +
            tooltipRow(FT_COLORS.expense, 'Gastos', formatMoney(p.outflow)) +
            tooltipRow(FT_COLORS.investment, 'Inversión', formatMoney(p.investment))
          );
        },
      },
      series: [
        serie('Ingresos', FT_COLORS.income, (i) => periods[i]?.income ?? 0),
        serie('Gastos', FT_COLORS.expense, (i) => periods[i]?.outflow ?? 0),
        serie('Inversión', FT_COLORS.investment, (i) => periods[i]?.investment ?? 0),
      ],
    };
    return option;
  });
}
