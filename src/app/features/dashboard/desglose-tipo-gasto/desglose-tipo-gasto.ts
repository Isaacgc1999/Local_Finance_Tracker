import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { currencySymbol, formatAmount, formatMoney } from '../../../core/format/money-format';
import { formatBasisPoints } from '../../../core/format/percent-format';
import type { Money } from '../../../core/types/money';
import type { DonutSlice } from '../../../facades/dashboard.facade';
import type { FtChartOption } from '../../../shared/charts/echarts';
import { FT_COLORS, FT_TOOLTIP, tooltipRow, tooltipTitle } from '../../../shared/charts/palette';
import { ChartDirective } from '../../../shared/directives/chart.directive';

/**
 * «Desglose por tipo de gasto» del handoff: donut de 148px con agujero de
 * 96px (total dentro) y, a la derecha, cuatro filas punto + nombre + importe
 * + porcentaje alineado a la derecha.
 */
@Component({
  selector: 'ft-desglose-tipo-gasto',
  imports: [ChartDirective],
  templateUrl: './desglose-tipo-gasto.html',
  styleUrl: './desglose-tipo-gasto.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesgloseTipoGasto {
  readonly slices = input.required<readonly DonutSlice[]>();
  readonly total = input.required<Money>();

  protected readonly totalTexto = computed(() => formatAmount(this.total()));
  protected readonly simbolo = computed(() => currencySymbol());
  protected readonly filas = computed(() =>
    this.slices().map((s) => ({ ...s, importe: formatMoney(s.amount), porcentaje: formatBasisPoints(s.shareBp) })),
  );

  protected readonly option = computed<FtChartOption>(() => {
    const slices = this.slices();
    const empty = this.total() === 0;
    return {
      animation: false,
      tooltip: {
        ...FT_TOOLTIP,
        trigger: 'item',
        formatter: (params) => {
          const p = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number } | undefined;
          const s = slices[p?.dataIndex ?? 0];
          return s ? tooltipTitle(s.label) + tooltipRow(s.color, 'Importe', formatMoney(s.amount)) + tooltipRow(s.color, 'Del gasto', formatBasisPoints(s.shareBp)) : '';
        },
      },
      series: [
        {
          type: 'pie',
          radius: [48, 74],
          center: ['50%', '50%'],
          silent: empty,
          label: { show: false },
          labelLine: { show: false },
          emphasis: { scale: false },
          itemStyle: { borderWidth: 0 },
          data: empty
            ? [{ value: 1, itemStyle: { color: FT_COLORS.surfaceElevated } }]
            : slices.map((s) => ({ value: s.amount, name: s.label, itemStyle: { color: s.color } })),
        },
      ],
    };
  });
}
