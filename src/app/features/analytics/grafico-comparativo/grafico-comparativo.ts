import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';

import { formatMoney } from '../../../core/format/money-format';
import { formatBasisPoints } from '../../../core/format/percent-format';
import { money, ratioBasisPoints } from '../../../core/types/money';
import type { AnalyticsSnapshot } from '../../../domain/analytics/analytics.service';
import type { Granularity } from '../../../domain/analytics/periods';
import type { FtChartOption } from '../../../shared/charts/echarts';
import { FT_COLORS, FT_TOOLTIP, chartFont, tooltipRow, tooltipTitle } from '../../../shared/charts/palette';
import { ChartDirective } from '../../../shared/directives/chart.directive';
import { ScrollEndDirective } from '../../../shared/directives/scroll-end.directive';
import { VISIBLE_PERIODS, chartWidthPercent } from '../chart-window';

const TITLE: Readonly<Record<Granularity, string>> = {
  day: 'Ingresos, gastos y ahorro por día',
  week: 'Ingresos, gastos y ahorro por semana',
  month: 'Ingresos, gastos y ahorro por mes',
  year: 'Ingresos, gastos y ahorro por año',
};

/**
 * Gráfico comparativo del handoff: barras agrupadas de 22px (16 en tablet y
 * móvil) por periodo en el orden Ingresos / Gastos / Inversión, r4 arriba,
 * leyenda en la cabecera y tooltip de 196px. Ahorro e inversión van apilados
 * en una sola barra, y la línea discontinua es lo apartado del periodo
 * ((ahorro + inversión) / ingresos) en su propio eje. No es la «tasa de
 * ahorro» de las métricas, que mide lo que no se gasta. Si hay más periodos de los que
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
      { label: corta ? 'Ahr.' : 'Ahorro', color: FT_COLORS.savings },
      { label: corta ? 'Inv.' : 'Inversión', color: FT_COLORS.investment },
      { label: corta ? '% ap.' : '% apartado', color: FT_COLORS.accent },
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
    const rate = (i: number): number | null => {
      const p = periods[i];
      return p ? ratioBasisPoints(money(p.saving + p.investment), p.income) : null;
    };
    const serie = (name: string, color: string, pick: (i: number) => number, stack?: string): BarSeriesOption => ({
      name,
      type: 'bar',
      ...(stack ? { stack } : {}),
      barWidth,
      barMaxWidth: barWidth,
      barGap: '18%',
      barCategoryGap: '30%',
      // En la barra apilada solo redondea la de arriba (inversión).
      itemStyle: { color, borderRadius: name === 'Ahorro' ? 0 : [4, 4, 0, 0] },
      emphasis: { disabled: true },
      data: periods.map((_, i) => pick(i)),
    });
    const tasa: LineSeriesOption = {
      name: 'Apartado',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      connectNulls: false,
      lineStyle: { color: FT_COLORS.accent, width: 2, type: 'dashed' },
      itemStyle: { color: FT_COLORS.accent },
      emphasis: { disabled: true },
      data: periods.map((_, i) => rate(i)),
    };
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
        axisLabel: { color: FT_COLORS.text3, fontFamily: chartFont(), fontSize: 13, margin: 14, interval: 'auto' },
      },
      yAxis: [
        { type: 'value', show: false },
        { type: 'value', show: false, min: 0, max: (v) => Math.max(10000, v.max) },
      ],
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
            tooltipRow(FT_COLORS.savings, 'Ahorro', formatMoney(p.saving)) +
            tooltipRow(FT_COLORS.investment, 'Inversión', formatMoney(p.investment)) +
            tooltipRow(FT_COLORS.accent, 'Apartado', formatBasisPoints(rate(first?.dataIndex ?? 0)))
          );
        },
      },
      series: [
        serie('Ingresos', FT_COLORS.income, (i) => periods[i]?.income ?? 0),
        serie('Gastos', FT_COLORS.expense, (i) => periods[i]?.outflow ?? 0),
        serie('Ahorro', FT_COLORS.savings, (i) => periods[i]?.saving ?? 0, 'apartado'),
        serie('Inversión', FT_COLORS.investment, (i) => periods[i]?.investment ?? 0, 'apartado'),
        tasa,
      ],
    };
    return option;
  });
}
