import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { DataZoomInsideComponent, DataZoomSliderComponent, GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { type ComposeOption, type ECharts, init, use } from 'echarts/core';
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts';
import type { DataZoomComponentOption, GridComponentOption, MarkLineComponentOption, TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

/**
 * Registro explícito de lo que usa la app (import directo, sin wrapper).
 * Renderer SVG: más ligero, nítido a cualquier escala y exportable a PNG a 2x.
 */
use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, DataZoomInsideComponent, DataZoomSliderComponent, MarkLineComponent, SVGRenderer]);

export type FtChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | MarkLineComponentOption
>;

export type { ECharts };

export function initChart(element: HTMLElement): ECharts {
  return init(element, undefined, { renderer: 'svg' });
}
