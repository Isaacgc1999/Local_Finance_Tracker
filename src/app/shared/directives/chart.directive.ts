import { DestroyRef, Directive, ElementRef, afterNextRender, effect, inject, input, output, untracked } from '@angular/core';

import { registerChart } from '../charts/chart-registry';
import { type ECharts, type FtChartOption, initChart } from '../charts/echarts';

/**
 * `<div [chart]="option()">`: crea la instancia de ECharts sobre el elemento,
 * aplica la opción cada vez que la signal cambia y se redimensiona con
 * ResizeObserver (nunca con listeners de window). Se destruye con el host.
 * Con `chartId`, la instancia queda disponible para exportarla a PNG.
 */
@Directive({ selector: '[chart]' })
export class ChartDirective {
  readonly chart = input.required<FtChartOption>();
  /** Nombre con el que el exportador recupera este gráfico (ver `CHART_IDS`). */
  readonly chartId = input<string>('');
  readonly chartReady = output<ECharts>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private instance: ECharts | null = null;

  constructor() {
    afterNextRender(() => {
      const el = this.host.nativeElement;
      const instance = initChart(el);
      this.instance = instance;
      instance.setOption(
        untracked(() => this.chart()),
        { notMerge: true },
      );
      this.chartReady.emit(instance);
      const id = untracked(() => this.chartId());
      const unregister = id ? registerChart(id, instance) : null;

      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => instance.resize());
      observer?.observe(el);
      this.destroyRef.onDestroy(() => {
        unregister?.();
        observer?.disconnect();
        instance.dispose();
        this.instance = null;
      });
    });

    effect(() => {
      const option = this.chart();
      this.instance?.setOption(option, { notMerge: true });
    });
  }
}
