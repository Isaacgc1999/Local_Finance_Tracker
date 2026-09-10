import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { type ComposeOption, type ECharts, init, use } from 'echarts/core';
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts';
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

/**
 * Registro explícito de lo que usa la app (import directo, sin wrapper).
 * Renderer SVG: más ligero, nítido a cualquier escala y exportable a PNG a 2x.
 */
use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, SVGRenderer]);

export type FtChartOption = ComposeOption<
  BarSeriesOption | LineSeriesOption | PieSeriesOption | GridComponentOption | TooltipComponentOption
>;

export type { ECharts };

export function initChart(element: HTMLElement): ECharts {
  return init(element, undefined, { renderer: 'svg' });
}
