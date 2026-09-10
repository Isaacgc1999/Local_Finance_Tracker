import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { formatDayMonth } from '../../../core/format/date-format';
import { formatAmount, formatMoney } from '../../../core/format/money-format';
import { EXPENSE_KINDS, EXPENSE_KIND_LABEL } from '../../../domain/analytics/expense-kind';
import type { WeekStack } from '../../../facades/dashboard.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import type { BarSeriesOption } from 'echarts/charts';

import type { FtChartOption } from '../../../shared/charts/echarts';
import { FT_COLORS, FT_FONT, FT_TOOLTIP, tooltipRow, tooltipTitle } from '../../../shared/charts/palette';
import { ChartDirective } from '../../../shared/directives/chart.directive';

const RADIUS = 6;

/**
 * «Gasto por semana» del handoff: barras apiladas S1–S5 con los 4 tipos de
 * gasto en la rampa del donut, esquinas redondeadas solo en el conjunto,
 * total de la semana encima y leyenda en la cabecera. Contenedor de 215px.
 * En móvil, columnas fijas de 64px con scroll horizontal («desliza →»).
 */
@Component({
  selector: 'ft-gasto-por-semana',
  imports: [ChartDirective],
  templateUrl: './gasto-por-semana.html',
  styleUrl: './gasto-por-semana.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GastoPorSemana {
  readonly weeks = input.required<readonly WeekStack[]>();
  private readonly bp = inject(BreakpointService);

  protected readonly leyenda = EXPENSE_KINDS.map((k, i) => ({ label: EXPENSE_KIND_LABEL[k], color: FT_COLORS.expenseRamp[i] ?? FT_COLORS.expense }));
  protected readonly movil = this.bp.isMobile;
  protected readonly anchoMovil = computed(() => `${this.weeks().length * 88}px`);

  protected readonly option = computed<FtChartOption>(() => {
    const weeks = this.weeks();
    const barMaxWidth = this.bp.isMobile() ? 48 : this.bp.isTablet() ? 56 : 72;
    const maxTotal = Math.max(1, ...weeks.map((w) => w.total));

    const series: BarSeriesOption[] = EXPENSE_KINDS.map((kind, k) => ({
      name: EXPENSE_KIND_LABEL[kind],
      type: 'bar' as const,
      stack: 'semana',
      barMaxWidth,
      barCategoryGap: '40%',
      color: FT_COLORS.expenseRamp[k] ?? FT_COLORS.expense,
      emphasis: { disabled: true },
      data: weeks.map((w) => {
        const value = w.segments[kind];
        const present = EXPENSE_KINDS.filter((x) => w.segments[x] > 0);
        const isTop = present[present.length - 1] === kind;
        const isBottom = present[0] === kind;
        return {
          value,
          itemStyle: {
            borderRadius: [isTop ? RADIUS : 0, isTop ? RADIUS : 0, isBottom ? RADIUS : 0, isBottom ? RADIUS : 0],
          },
          label: isTop
            ? {
                show: true,
                position: 'top' as const,
                distance: 8,
                formatter: () => (this.bp.isDesktop() ? formatMoney(w.total) : formatAmount(w.total)),
                color: FT_COLORS.text2,
                fontFamily: FT_FONT,
                fontSize: 13,
              }
            : { show: false },
        };
      }),
    }));

    const option: FtChartOption = {
      animation: false,
      grid: { left: 8, right: 8, top: 26, bottom: 26, containLabel: false },
      xAxis: {
        type: 'category',
        data: weeks.map((w) => w.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: FT_COLORS.text3, fontFamily: FT_FONT, fontSize: 13, margin: 12 },
      },
      yAxis: { type: 'value', show: false, max: maxTotal * 1.12 },
      tooltip: {
        ...FT_TOOLTIP,
        trigger: 'axis',
        axisPointer: { type: 'none' },
        formatter: (params) => {
          const list = Array.isArray(params) ? params : [params];
          const first = list[0] as { dataIndex?: number } | undefined;
          const week = weeks[first?.dataIndex ?? 0];
          if (!week) return '';
          const rows = EXPENSE_KINDS.map((kind, k) => tooltipRow(FT_COLORS.expenseRamp[k] ?? '', EXPENSE_KIND_LABEL[kind], formatMoney(week.segments[kind]))).join('');
          return tooltipTitle(`${week.label} · ${formatDayMonth(week.from)}–${formatDayMonth(week.to)}`) + rows + tooltipRow(FT_COLORS.text1, 'Total', formatMoney(week.total));
        },
      },
      series,
    };
    return option;
  });
}
