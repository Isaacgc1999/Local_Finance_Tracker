import { type DateFormat, formatDayMonthYear, formatMonthYear, formatRange } from '../../core/format/date-format';
import { formatAmount, formatMoney } from '../../core/format/money-format';
import { DASH, formatBasisPoints, formatDelta } from '../../core/format/percent-format';
import type { Category } from '../../core/types/category';
import { EVENT_TYPE_LABEL, type Event, NATURE_LABEL, isOutflow } from '../../core/types/event';
import type { DateRange } from '../../core/types/iso-date';
import { type Money, toEurosForExport } from '../../core/types/money';
import type { AnalyticsSnapshot, CategoryBreakdown } from '../analytics/analytics.service';
import { EXPENSE_KINDS, EXPENSE_KIND_LABEL, expenseKindOf } from '../analytics/expense-kind';

export type ExportFormat = 'xlsx' | 'pdf' | 'docx';

export const EXPORT_EXTENSION: Readonly<Record<ExportFormat, string>> = { xlsx: 'xlsx', pdf: 'pdf', docx: 'docx' };
export const EXPORT_LABEL: Readonly<Record<ExportFormat, string>> = { xlsx: 'Excel', pdf: 'PDF', docx: 'Word' };
export const EXPORT_MIME: Readonly<Record<ExportFormat, string>> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export interface ExportOptions {
  readonly format: ExportFormat;
  readonly range: DateRange;
  readonly includeCharts: boolean;
  readonly includeBreakdown: boolean;
  readonly includeRawMovements: boolean;
}

/** Gráfico ya rasterizado a PNG (`echarts.getDataURL()` a 2x). */
export interface ChartImage {
  readonly title: string;
  readonly dataUrl: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Fila de la tabla de resumen; los tres formatos muestran exactamente estas. */
export interface SummaryRow {
  readonly label: string;
  readonly text: string;
  /** Valor numérico en euros para las celdas de moneda de Excel. */
  readonly euros: number | null;
}

export interface KindRow {
  readonly label: string;
  readonly amount: Money;
  readonly euros: number;
  readonly shareText: string;
}

export interface MovementRow {
  readonly date: string;
  readonly type: string;
  readonly concept: string;
  readonly category: string;
  readonly nature: string;
  readonly paymentMethod: string;
  readonly amount: Money;
  /** Con signo: los gastos en negativo, como se leen en el listado. */
  readonly euros: number;
  readonly notes: string;
}

/**
 * Contenido común a Excel, PDF y Word: portada, resumen, gráficos, desglose
 * por tipo de gasto, tabla de categorías y listado de movimientos.
 * Los tres exportadores consumen esto y solo cambian el envoltorio.
 */
export interface ExportModel {
  readonly title: string;
  readonly subtitle: string;
  readonly periodText: string;
  readonly generatedAtText: string;
  readonly options: ExportOptions;
  readonly summary: readonly SummaryRow[];
  readonly kinds: readonly KindRow[];
  readonly categories: readonly CategoryBreakdown[];
  readonly categoryRows: readonly (readonly string[])[];
  readonly movements: readonly MovementRow[];
  readonly charts: readonly ChartImage[];
  readonly snapshot: AnalyticsSnapshot;
}

export const CATEGORY_HEADERS: readonly string[] = ['Categoría', 'Nº', 'Total', '% gasto', '% ingresos', 'Media', 'Var. periodo'];
export const MOVEMENT_HEADERS: readonly string[] = ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Naturaleza', 'Método de pago', 'Importe', 'Notas'];

function nombreCategoria(e: Event, categories: ReadonlyMap<string, Category>): string {
  if (!e.categoryId) return '';
  return categories.get(e.categoryId)?.name ?? 'Categoría eliminada';
}

export interface BuildModelInput {
  readonly snapshot: AnalyticsSnapshot;
  readonly events: readonly Event[];
  readonly categories: ReadonlyMap<string, Category>;
  readonly options: ExportOptions;
  readonly charts: readonly ChartImage[];
  /** Formato numérico de fecha elegido en Ajustes. */
  readonly dateFormat?: DateFormat;
  readonly now?: Date;
}

/** Construye el modelo. Puro y determinista: mismo snapshot, mismo documento. */
export function buildExportModel(input: BuildModelInput): ExportModel {
  const { snapshot: s, options, categories } = input;
  const now = input.now ?? new Date();

  const money = (m: Money): SummaryRow['euros'] => toEurosForExport(m);
  const summary: SummaryRow[] = [
    { label: 'Total ingresos', text: formatMoney(s.income), euros: money(s.income) },
    { label: 'Total gastos', text: formatMoney(s.outflow), euros: money(s.outflow) },
    { label: 'Balance', text: formatMoney(s.balance, { sign: 'always' }), euros: money(s.balance) },
    { label: 'Ahorro', text: formatMoney(s.totals.saving), euros: money(s.totals.saving) },
    { label: 'Inversión', text: formatMoney(s.totals.investment), euros: money(s.totals.investment) },
    { label: 'Tasa de ahorro', text: formatBasisPoints(s.savingsRateBp), euros: null },
    { label: 'Gasto sobre ingresos', text: formatBasisPoints(s.outflowShareOfIncomeBp), euros: null },
    { label: 'Gasto medio diario', text: s.dailyAverage === null ? DASH : formatMoney(s.dailyAverage), euros: s.dailyAverage === null ? null : money(s.dailyAverage) },
    { label: 'Gasto medio por movimiento', text: s.averagePerEvent === null ? DASH : formatMoney(s.averagePerEvent), euros: s.averagePerEvent === null ? null : money(s.averagePerEvent) },
    { label: 'Mediana por movimiento', text: s.medianPerEvent === null ? DASH : formatMoney(s.medianPerEvent), euros: s.medianPerEvent === null ? null : money(s.medianPerEvent) },
    { label: 'Variación frente a la media de 3 periodos', text: formatDelta(s.variance.deltaBp).text, euros: null },
    { label: 'Desviación típica del gasto', text: s.variance.stdDevCents === null ? DASH : formatMoney(s.variance.stdDevCents as Money), euros: s.variance.stdDevCents === null ? null : s.variance.stdDevCents / 100 },
    { label: 'Saldo acumulado al cierre', text: formatMoney(s.currentBalance), euros: money(s.currentBalance) },
    { label: 'Movimientos', text: String(s.eventCount), euros: null },
    { label: 'Días del periodo', text: String(s.days), euros: null },
  ];

  const kinds: KindRow[] = EXPENSE_KINDS.map((kind) => {
    const amount = s.byExpenseKind[kind];
    const share = s.outflow > 0 ? Math.round((amount * 10000) / s.outflow) : null;
    return { label: EXPENSE_KIND_LABEL[kind], amount, euros: toEurosForExport(amount), shareText: formatBasisPoints(share) };
  });

  const categoryRows = s.byCategory.map((c) => [
    c.label,
    String(c.count),
    formatMoney(c.total),
    formatBasisPoints(c.shareOfExpensesBp),
    formatBasisPoints(c.shareOfIncomeBp),
    c.averagePerEvent === null ? DASH : formatMoney(c.averagePerEvent),
    c.deltaVsPreviousBp === null ? DASH : formatBasisPoints(c.deltaVsPreviousBp, { sign: 'always' }),
  ]);

  const movements: MovementRow[] = options.includeRawMovements
    ? [...input.events]
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .map((e) => ({
          date: formatDayMonthYear(e.date),
          type: EVENT_TYPE_LABEL[e.type],
          concept: e.concept,
          category: nombreCategoria(e, categories),
          nature: e.nature ? NATURE_LABEL[e.nature] : expenseKindOf(e) ? EXPENSE_KIND_LABEL[expenseKindOf(e)!] : '',
          paymentMethod: e.paymentMethod ?? '',
          amount: e.amountCents,
          euros: toEurosForExport(e.amountCents) * (isOutflow(e.type) ? -1 : 1),
          notes: e.notes ?? '',
        }))
    : [];

  const sameMonth = s.range.from.slice(0, 7) === s.range.to.slice(0, 7);
  return {
    title: 'Fintrack',
    subtitle: sameMonth ? formatMonthYear(s.range.from) : 'Informe de finanzas personales',
    periodText: formatRange(s.range, input.dateFormat ?? 'DD/MM/YYYY'),
    generatedAtText: `Generado el ${formatDayMonthYear(dateToIso(now))}`,
    options,
    summary,
    kinds,
    categories: s.byCategory,
    categoryRows,
    movements,
    charts: options.includeCharts ? input.charts : [],
    snapshot: s,
  };
}

function dateToIso(d: Date): never {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` as never;
}

/** `fintrack-2026-09.xlsx` (mes) o `fintrack-2026-04_2026-09.pdf` (rango). */
export function defaultFileName(range: DateRange, format: ExportFormat): string {
  const from = range.from.slice(0, 7);
  const to = range.to.slice(0, 7);
  const period = from === to ? from : `${from}_${to}`;
  return `fintrack-${period}.${EXPORT_EXTENSION[format]}`;
}

/** Totales de la tabla de categorías, en el mismo orden que `CATEGORY_HEADERS`. */
export function categoryTotalsRow(s: AnalyticsSnapshot): readonly string[] {
  return [
    'Total',
    String(s.outflowCount),
    formatMoney(s.outflow),
    s.outflow > 0 ? '100 %' : DASH,
    formatBasisPoints(s.outflowShareOfIncomeBp),
    s.averagePerEvent === null ? DASH : formatMoney(s.averagePerEvent),
    s.comparison.outflowDeltaBp === null ? DASH : formatBasisPoints(s.comparison.outflowDeltaBp, { sign: 'always' }),
  ];
}

/** Cifra sin símbolo para ejes y celdas de texto. */
export function plainAmount(m: Money): string {
  return formatAmount(m);
}
