import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { currencySymbol, formatMoney } from '../../../core/format/money-format';
import type { Money } from '../../../core/types/money';
import {
  EVOLUTION_GRANULARITY_LABEL,
  EVOLUTION_WINDOW,
  type EvolutionGranularity,
  type EvolutionPoint,
} from '../../../domain/analytics/evolution';
import { ChartDirective } from '../../directives/chart.directive';
import { FT_COLORS, FT_TOOLTIP, chartFont, tooltipRow, tooltipTitle } from '../../charts/palette';
import type { FtChartOption } from '../../charts/echarts';
import { SegmentedControl, type SegmentOption } from '../segmented-control/segmented-control';

/** Eje Y corto: «12,5 k€», «850 €». `v` en céntimos. */
function compacto(v: number): string {
  const euros = v / 100;
  const abs = Math.abs(euros);
  const fmt = (n: number, d: number) => n.toLocaleString('es-ES', { maximumFractionDigits: d });
  const body = abs >= 1_000_000 ? `${fmt(euros / 1_000_000, 1)} M` : abs >= 1_000 ? `${fmt(euros / 1_000, 1)} k` : fmt(euros, 0) + ' ';
  return `${body}${currencySymbol()}`;
}

const OPCIONES: readonly SegmentOption<EvolutionGranularity>[] = (['day', 'month', 'year'] as const).map((value) => ({
  value,
  label: EVOLUTION_GRANULARITY_LABEL[value],
}));

/**
 * Gráfico de evolución en onda (área suavizada) con filtro Días / Meses /
 * Años. De entrada enseña los últimos 10 días, los 3 meses anteriores y el
 * actual, o los últimos 5 años; lo anterior sigue ahí con scroll lateral
 * (rueda, arrastre o la barra de abajo). Con `secondary`, una línea
 * discontinua compara (lo aportado frente al valor de mercado).
 */
@Component({
  selector: 'ft-grafico-evolucion',
  imports: [ChartDirective, SegmentedControl],
  template: `
    <header class="cabecera">
      <div class="titulos">
        <h2 class="ft-card__title">{{ titulo() }}</h2>
        @if (variacion(); as v) {
          <span class="variacion num" [class.ft-c-income]="v.delta > 0" [class.ft-c-expense]="v.delta < 0">{{ v.texto }}</span>
        }
      </div>
      <ft-segmented-control label="Agrupar por" [options]="opciones" [value]="granularity()" (valueChange)="$event && granularity.set($event)" />
    </header>
    @if (vacio()) {
      <p class="vacio">{{ textoVacio() }}</p>
    } @else {
      <div class="grafico" [chart]="option()"></div>
      @if (desplazable()) {
        <p class="pista">Arrastra el gráfico o la barra para ver periodos anteriores.</p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
    .cabecera {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .titulos {
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex-wrap: wrap;
    }
    .titulos h2 {
      margin: 0;
    }
    .variacion {
      font: var(--ft-font-meta-strong);
    }
    .grafico {
      height: 260px;
      width: 100%;
    }
    .vacio,
    .pista {
      font: var(--ft-font-meta);
      line-height: 1.5;
      color: var(--ft-text-3);
    }
    .vacio {
      padding: 32px 0;
      text-align: center;
    }
    .pista {
      margin-top: -8px;
    }
  `,
  host: { class: 'ft-card' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficoEvolucion {
  readonly titulo = input.required<string>();
  readonly points = input.required<readonly EvolutionPoint[]>();
  readonly granularity = model<EvolutionGranularity>('month');
  /** Color de la serie; sin él, el de inversión del tema activo. */
  readonly color = input<string | null>(null);
  readonly label = input<string>('Total');
  readonly secondaryLabel = input<string>('');
  readonly textoVacio = input<string>('Todavía no hay datos.');

  protected readonly opciones = OPCIONES;

  protected readonly vacio = computed(() => this.points().every((p) => p.value === 0 && (p.secondary ?? 0) === 0));
  protected readonly desplazable = computed(() => this.points().length > EVOLUTION_WINDOW[this.granularity()]);

  /** Variación entre el primer y el último periodo visibles de entrada. */
  protected readonly variacion = computed(() => {
    const pts = this.points();
    const n = EVOLUTION_WINDOW[this.granularity()];
    const visible = pts.slice(-n);
    const first = visible[0];
    const last = visible[visible.length - 1];
    if (!first || !last || visible.length < 2) return null;
    const delta = last.value - first.value;
    const pct = first.value !== 0 ? ` (${((delta / Math.abs(first.value)) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1, signDisplay: 'always' })} %)` : '';
    const span = this.granularity() === 'day' ? `${visible.length} días` : this.granularity() === 'month' ? `${visible.length} meses` : `${visible.length} años`;
    return { delta, texto: `${formatMoney(delta as Money, { sign: 'always' })}${pct} en ${span}` };
  });

  protected readonly option = computed<FtChartOption>(() => {
    const pts = this.points();
    const color = this.color() ?? FT_COLORS.investment;
    const n = EVOLUTION_WINDOW[this.granularity()];
    const startValue = Math.max(0, pts.length - n);
    const hasSecondary = !!this.secondaryLabel() && pts.some((p) => p.secondary !== null);
    const scroll = pts.length > n;
    return {
      grid: { left: 8, right: 8, top: 16, bottom: scroll ? 44 : 8, containLabel: true },
      tooltip: {
        ...FT_TOOLTIP,
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: FT_COLORS.border } },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? (params as { dataIndex: number }[]) : [];
          const p = pts[list[0]?.dataIndex ?? -1];
          if (!p) return '';
          let html = tooltipTitle(p.period.longLabel) + tooltipRow(color, this.label(), formatMoney(p.value));
          if (hasSecondary && p.secondary !== null) {
            html += tooltipRow(FT_COLORS.text2, this.secondaryLabel(), formatMoney(p.secondary));
            const gain = (p.value - p.secondary) as Money;
            html += tooltipRow(gain >= 0 ? FT_COLORS.income : FT_COLORS.expense, 'Diferencia', formatMoney(gain, { sign: 'always' }));
          }
          return html;
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: pts.map((p) => p.period.label),
        axisLine: { lineStyle: { color: FT_COLORS.border } },
        axisTick: { show: false },
        axisLabel: { color: FT_COLORS.text3, fontFamily: chartFont(), fontSize: 12 },
        axisLabel: { color: FT_COLORS.text3, fontFamily: chartFont(), fontSize: 12 },
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: FT_COLORS.border, type: 'dashed' } },
        axisLabel: {
          color: FT_COLORS.text3,
          fontFamily: chartFont(),
          fontFamily: chartFont(),
          fontSize: 12,
          formatter: (v: number) => compacto(v),
        },
      },
      dataZoom: scroll
        ? [
            { type: 'inside', startValue, endValue: pts.length - 1, zoomLock: true, moveOnMouseWheel: true },
            {
              type: 'slider',
              startValue,
              endValue: pts.length - 1,
              zoomLock: true,
              height: 18,
              bottom: 8,
              brushSelect: false,
              showDetail: false,
              borderColor: FT_COLORS.border,
              backgroundColor: FT_COLORS.surfaceElevated,
              fillerColor: `${color}33`,
              handleStyle: { color: FT_COLORS.text2, borderColor: FT_COLORS.border },
              moveHandleStyle: { color: FT_COLORS.border },
              dataBackground: { lineStyle: { color: FT_COLORS.text3 }, areaStyle: { color: FT_COLORS.border } },
              textStyle: { color: FT_COLORS.text3 },
            },
          ]
        : [],
      series: [
        {
          type: 'line',
          name: this.label(),
          data: pts.map((p) => p.value),
          smooth: 0.35,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: pts.length <= 40,
          lineStyle: { color, width: 2.5 },
          itemStyle: { color },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${color}55` },
                { offset: 1, color: `${color}05` },
              ],
            },
          },
        },
        ...(hasSecondary
          ? [
              {
                type: 'line' as const,
                name: this.secondaryLabel(),
                data: pts.map((p) => p.secondary ?? 0),
                smooth: 0.35,
                symbol: 'none',
                lineStyle: { color: FT_COLORS.text2, width: 1.5, type: 'dashed' as const },
                itemStyle: { color: FT_COLORS.text2 },
              },
            ]
          : []),
      ],
    };
  });
}
