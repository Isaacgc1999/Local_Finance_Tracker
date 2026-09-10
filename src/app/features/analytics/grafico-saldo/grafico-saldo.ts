import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { LineSeriesOption } from 'echarts/charts';

import { formatDayMonth } from '../../../core/format/date-format';
import { formatMoney } from '../../../core/format/money-format';
import type { AnalyticsSnapshot } from '../../../domain/analytics/analytics.service';
import type { Granularity } from '../../../domain/analytics/periods';
import type { FtChartOption } from '../../../shared/charts/echarts';
import { FT_COLORS, FT_FONT, FT_TOOLTIP, tooltipRow, tooltipTitle } from '../../../shared/charts/palette';
import { ChartDirective } from '../../../shared/directives/chart.directive';
import { ScrollEndDirective } from '../../../shared/directives/scroll-end.directive';
import { VISIBLE_PERIODS, chartWidthPercent } from '../chart-window';

const MA_LABEL: Readonly<Record<Granularity, string>> = {
  day: 'Media móvil 7 d',
  week: 'Media móvil 3 sem.',
  month: 'Media móvil 3 m',
  year: 'Media móvil 3 a',
};
const PERIOD_SHORT: Readonly<Record<Granularity, string>> = { day: 'd', week: 'sem.', month: 'm', year: 'a' };

/**
 * «Saldo acumulado» del handoff: línea en acento (2,5px) con la media móvil
 * superpuesta en `text-3` discontinua (6 5), 4 líneas de rejilla, eje de
 * periodos debajo y pie con «Saldo actual» y «Variación 6 m». En Día se
 * dibujan las medias de 7 y 30 días sobre la serie diaria. Si hay más puntos
 * de los que caben (`VISIBLE_PERIODS`), scroll horizontal que arranca en los
 * más recientes.
 */
@Component({
  selector: 'ft-grafico-saldo',
  imports: [ChartDirective, ScrollEndDirective],
  templateUrl: './grafico-saldo.html',
  styleUrl: './grafico-saldo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficoSaldo {
  readonly snapshot = input.required<AnalyticsSnapshot>();
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');

  protected readonly saldoActual = computed(() => formatMoney(this.snapshot().currentBalance));
  protected readonly variacion = computed(() => formatMoney(this.snapshot().balanceVariation, { sign: 'always' }));
  protected readonly variacionPositiva = computed(() => this.snapshot().balanceVariation >= 0);
  protected readonly variacionLabel = computed(() => {
    const s = this.snapshot();
    return `Variación ${s.periods.length} ${PERIOD_SHORT[s.granularity]}`;
  });
  protected readonly leyenda = computed(() => {
    const g = this.snapshot().granularity;
    return g === 'day'
      ? [
          { label: 'Saldo', color: FT_COLORS.accent, dashed: false },
          { label: 'Media 7 d', color: FT_COLORS.text3, dashed: true },
          { label: 'Media 30 d', color: FT_COLORS.text2, dashed: true },
        ]
      : [
          { label: 'Saldo', color: FT_COLORS.accent, dashed: false },
          { label: MA_LABEL[g], color: FT_COLORS.text3, dashed: true },
        ];
  });

  /** Ancho del gráfico dentro del contenedor con scroll; `null` = el del contenedor. */
  protected readonly ancho = computed(() => {
    const s = this.snapshot();
    const n = s.granularity === 'day' ? s.daily.length : s.periods.length;
    const pct = chartWidthPercent(n, VISIBLE_PERIODS[s.granularity], true);
    return pct === null ? null : `${pct}%`;
  });

  /** Al cambiar la granularidad o el rango, el scroll vuelve a lo más reciente. */
  protected readonly vista = computed(() => {
    const s = this.snapshot();
    return `${s.granularity}|${s.range.from}|${s.range.to}|${this.variante()}`;
  });

  protected readonly option = computed<FtChartOption>(() => {
    const s = this.snapshot();
    const daily = s.granularity === 'day';
    const labels = daily ? s.daily.map((p) => formatDayMonth(p.date)) : s.periods.map((p) => p.label);
    const saldo = daily ? s.daily.map((p) => p.cumulative) : s.periods.map((p) => p.cumulative);
    const toSeries = (name: string, values: readonly (number | null)[], color: string, width: number, dashed: boolean): LineSeriesOption => ({
      name,
      type: 'line',
      data: values.map((v) => (v === null ? null : v)),
      showSymbol: false,
      symbol: 'none',
      connectNulls: false,
      lineStyle: { color, width, type: dashed ? [6, 5] : 'solid' },
      itemStyle: { color },
      emphasis: { disabled: true },
      smooth: false,
    });
    const series: LineSeriesOption[] = [toSeries('Saldo', saldo, FT_COLORS.accent, 2.5, false)];
    if (daily) {
      series.push(toSeries('Media 7 d', s.movingAverage7, FT_COLORS.text3, 2, true));
      series.push(toSeries('Media 30 d', s.movingAverage30, FT_COLORS.text2, 2, true));
    } else {
      series.push(toSeries(MA_LABEL[s.granularity], s.movingAverage3Periods, FT_COLORS.text3, 2, true));
    }
    const option: FtChartOption = {
      animation: false,
      grid: { left: 4, right: 4, top: 8, bottom: 26, containLabel: false },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: FT_COLORS.text3, fontFamily: FT_FONT, fontSize: 13, margin: 12, interval: 'auto', showMinLabel: true, showMaxLabel: true },
      },
      yAxis: {
        type: 'value',
        splitNumber: 4,
        scale: true,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: FT_COLORS.surfaceElevated, width: 1 } },
      },
      tooltip: {
        ...FT_TOOLTIP,
        // Fuera del contenedor con scroll, que si no lo recortaría.
        appendTo: 'body',
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: FT_COLORS.border } },
        formatter: (params) => {
          const list = Array.isArray(params) ? params : [params];
          const first = list[0] as { dataIndex?: number } | undefined;
          const i = first?.dataIndex ?? 0;
          const title = daily ? formatDayMonth(s.daily[i]?.date ?? s.range.from) : (s.periods[i]?.longLabel ?? '');
          const rows = list
            .map((p) => p as { seriesName?: string; value?: number | null; color?: string })
            .filter((p) => p.value !== null && p.value !== undefined)
            .map((p) => tooltipRow(String(p.color ?? ''), p.seriesName ?? '', formatMoney((p.value ?? 0) as never)))
            .join('');
          return tooltipTitle(title) + rows;
        },
      },
      series,
    };
    return option;
  });
}
