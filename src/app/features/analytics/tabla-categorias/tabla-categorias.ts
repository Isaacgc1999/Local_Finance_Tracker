import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { formatMoney } from '../../../core/format/money-format';
import { DASH, formatBasisPoints } from '../../../core/format/percent-format';
import type { CategoryBreakdown } from '../../../domain/analytics/analytics.service';
import type { SortColumn, SortDir } from '../../../facades/analytics.facade';

interface Columna {
  readonly key: SortColumn;
  readonly label: string;
  readonly labelCorta: string;
  readonly numerica: boolean;
}

export const COLUMNAS: readonly Columna[] = [
  { key: 'label', label: 'Categoría', labelCorta: 'Categoría', numerica: false },
  { key: 'count', label: 'Nº', labelCorta: 'Nº', numerica: true },
  { key: 'total', label: 'Total', labelCorta: 'Total', numerica: true },
  { key: 'shareOfExpenses', label: '% gasto', labelCorta: '% gasto', numerica: true },
  { key: 'shareOfIncome', label: '% ingresos', labelCorta: '% ingr.', numerica: true },
  { key: 'average', label: 'Media', labelCorta: 'Media', numerica: true },
  { key: 'delta', label: 'Var. periodo', labelCorta: 'Var.', numerica: true },
];

/** Columnas del frame 768 (5 de las 7). */
const COLUMNAS_TABLET: readonly SortColumn[] = ['label', 'count', 'total', 'shareOfExpenses', 'delta'];

export interface FilaCategoria {
  readonly id: string;
  readonly label: string;
  readonly count: string;
  readonly total: string;
  readonly shareOfExpenses: string;
  readonly shareOfIncome: string;
  readonly average: string;
  readonly delta: string;
  readonly deltaTone: 'income' | 'expense' | 'neutral' | 'muted';
  readonly barPct: number;
  readonly countRaw: number;
}

function deltaTone(bp: number | null): FilaCategoria['deltaTone'] {
  if (bp === null) return 'muted';
  if (Math.abs(bp) < 100) return bp === 0 ? 'muted' : 'neutral';
  return bp > 0 ? 'expense' : 'income';
}

function toFila(r: CategoryBreakdown): FilaCategoria {
  return {
    id: r.categoryId ?? `__${r.label}`,
    label: r.label,
    count: String(r.count),
    total: formatMoney(r.total),
    shareOfExpenses: formatBasisPoints(r.shareOfExpensesBp, { decimals: r.shareOfExpensesBp === 10000 ? 0 : 1 }),
    shareOfIncome: formatBasisPoints(r.shareOfIncomeBp),
    average: r.averagePerEvent === null ? DASH : formatMoney(r.averagePerEvent),
    delta: r.deltaVsPreviousBp === null ? DASH : formatBasisPoints(r.deltaVsPreviousBp, { sign: 'always' }),
    deltaTone: deltaTone(r.deltaVsPreviousBp),
    barPct: Math.min(100, (r.shareOfExpensesBp ?? 0) / 100),
    countRaw: r.count,
  };
}

/**
 * Tabla de desglose por categoría del handoff: 7 columnas (grid
 * 2.2fr .7fr 1fr 1fr 1fr 1fr 1fr), cabecera 13px text-3 con la columna
 * ordenada en text-1 y «▾», mini barra de proporción de 4px bajo el nombre,
 * variación coloreada por signo y fila de totales. 768: 5 columnas.
 * 390: tarjetas apiladas.
 */
@Component({
  selector: 'ft-tabla-categorias',
  templateUrl: './tabla-categorias.html',
  styleUrl: './tabla-categorias.scss',
  host: { '[class]': '"variante-" + variante()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TablaCategorias {
  readonly rows = input.required<readonly CategoryBreakdown[]>();
  readonly totals = input.required<CategoryBreakdown | null>();
  readonly sortColumn = input.required<SortColumn>();
  readonly sortDir = input.required<SortDir>();
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');
  readonly sort = output<SortColumn>();

  protected readonly columnas = computed(() => (this.variante() === 'tablet' ? COLUMNAS.filter((c) => COLUMNAS_TABLET.includes(c.key)) : COLUMNAS));
  protected readonly filas = computed(() => this.rows().map(toFila));
  protected readonly totalFila = computed(() => {
    const t = this.totals();
    return t ? toFila(t) : null;
  });
  protected readonly ordenLabel = computed(() => COLUMNAS.find((c) => c.key === this.sortColumn())?.label.toLowerCase() ?? '');

  protected valor(fila: FilaCategoria, key: SortColumn): string {
    switch (key) {
      case 'label':
        return fila.label;
      case 'count':
        return fila.count;
      case 'total':
        return fila.total;
      case 'shareOfExpenses':
        return fila.shareOfExpenses;
      case 'shareOfIncome':
        return fila.shareOfIncome;
      case 'average':
        return fila.average;
      case 'delta':
        return fila.delta;
    }
  }
}
