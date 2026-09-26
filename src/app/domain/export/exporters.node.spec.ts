/**
 * Genera los tres ficheros de verdad (no mocks) y comprueba su contenido:
 * el Excel se vuelve a leer con SheetJS (celdas, formato de moneda y
 * fórmulas SUM vivas); el PDF y el Word se validan por firma y tamaño.
 */
import { SYSTEM_CATEGORY, type Category } from '../../core/types/category';
import type { Event, EventType } from '../../core/types/event';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { extractPdfText } from '../../../../tools/pdf-text';
import { computeSnapshot } from '../analytics/analytics.service';
import { buildDocument } from './index';
import { type ExportOptions, buildExportModel, defaultFileName } from './export-model';

let n = 0;
const ev = (type: EventType, cents: number, date: string, categoryId: string | null = null, concept = `Movimiento ${++n}`): Event => ({
  id: `e${n}`,
  type,
  amountCents: money(cents),
  date: date as never,
  concept,
  categoryId,
  nature: type === 'expense' ? 'variable' : null,
  paymentMethod: type === 'expense' ? 'Tarjeta' : null,
  notes: '',
  attachmentPath: null,
  recurrenceId: null, accountId: null,
  meta: null,
  createdAt: '',
  updatedAt: '',
});

const categories = new Map<string, Category>([
  [SYSTEM_CATEGORY.alimentacion, { id: SYSTEM_CATEGORY.alimentacion, name: 'Alimentación', icon: null, color: '#F45B5B', kind: 'expense', isSystem: true, sortOrder: 0 }],
  [SYSTEM_CATEGORY.hogar, { id: SYSTEM_CATEGORY.hogar, name: 'Hogar', icon: null, color: '#FBBF24', kind: 'expense', isSystem: true, sortOrder: 1 }],
]);

const events: Event[] = [
  ev('income', 241_268, '2026-08-05', null, 'Nómina Grupo Aldara'),
  ev('income', 275_268, '2026-09-05', null, 'Nómina Grupo Aldara'),
  ev('direct_debit', 78_000, '2026-09-01', SYSTEM_CATEGORY.hogar, 'Alquiler Carrer de Sants'),
  ev('expense', 7_241, '2026-09-08', SYSTEM_CATEGORY.alimentacion, 'Mercadona'),
  ev('expense', 4_500, '2026-09-09', SYSTEM_CATEGORY.alimentacion, 'Mercadona'),
  ev('subscription', 1_399, '2026-09-14', null, 'Netflix Estándar'),
  ev('saving', 40_000, '2026-09-06', null, 'Traspaso a cuenta ahorro'),
  ev('investment', 25_000, '2026-09-01', null, 'Aportación MSCI World'),
];

const snapshot = computeSnapshot({
  events,
  range: { from: isoDate(2026, 9, 1), to: isoDate(2026, 9, 30) },
  granularity: 'month',
  categories,
  budgetTargetCents: money(175_000),
  today: isoDate(2026, 9, 9),
  openingBalanceCents: money(100_000),
  savingsTargetBp: 3000,
});

const options = (overrides: Partial<ExportOptions> = {}): ExportOptions => ({
  format: 'xlsx',
  range: { from: isoDate(2026, 9, 1), to: isoDate(2026, 9, 30) },
  includeCharts: false,
  includeBreakdown: true,
  includeRawMovements: true,
  ...overrides,
});

const model = (o: ExportOptions) =>
  buildExportModel({ snapshot, events, categories, options: o, charts: [], now: new Date('2026-09-09T12:00:00Z') });

describe('modelo de exportación', () => {
  it('reúne el mismo contenido para los tres formatos', () => {
    const m = model(options());
    expect(m.periodText).toBe('01/09/2026 — 30/09/2026');
    expect(m.subtitle).toBe('Septiembre 2026');
    expect(m.generatedAtText).toBe('Generado el 9 sep 2026');
    expect(m.summary.find((r) => r.label === 'Total ingresos')?.text).toBe('2.752,68 €');
    expect(m.summary.find((r) => r.label === 'Total gastos')?.euros).toBe(911.4);
    expect(m.kinds.map((k) => k.label)).toEqual(['Fijo', 'Variable', 'Ocio', 'Suscripciones']);
    expect(m.kinds[0]?.euros).toBe(780);
    expect(m.categoryRows.length).toBe(m.categories.length);
    expect(m.movements.length).toBe(events.length);
    // Los gastos salen en negativo, como se leen en el listado.
    expect(m.movements.find((x) => x.concept === 'Mercadona')?.euros).toBe(-72.41);
    expect(m.movements.find((x) => x.concept.startsWith('Nómina'))?.euros).toBeGreaterThan(0);
  });

  it('omite movimientos y desglose cuando los toggles están apagados', () => {
    const m = model(options({ includeRawMovements: false, includeBreakdown: false }));
    expect(m.movements).toEqual([]);
    expect(m.charts).toEqual([]);
  });

  it('nombra el fichero por periodo', () => {
    expect(defaultFileName({ from: isoDate(2026, 9, 1), to: isoDate(2026, 9, 30) }, 'xlsx')).toBe('fintrack-2026-09.xlsx');
    expect(defaultFileName({ from: isoDate(2026, 4, 1), to: isoDate(2026, 9, 30) }, 'pdf')).toBe('fintrack-2026-04_2026-09.pdf');
    expect(defaultFileName({ from: isoDate(2026, 4, 1), to: isoDate(2026, 9, 30) }, 'docx')).toBe('fintrack-2026-04_2026-09.docx');
  });
});

describe('exportadores', () => {
  it('Excel: hojas, importes numéricos con formato de moneda y fórmulas SUM vivas', async () => {
    const result = await buildDocument(model(options({ format: 'xlsx' })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(2000);
    expect([...result.value.slice(0, 2)]).toEqual([0x50, 0x4b]); // PK: zip (xlsx)

    const XLSX = await import('xlsx');
    const wb = XLSX.read(result.value, { type: 'array', cellNF: true });
    expect(wb.SheetNames).toEqual(['Resumen', 'Movimientos', 'Categorías']);

    const resumen = wb.Sheets['Resumen'];
    const ingresos = resumen?.['B8'];
    expect(ingresos?.t).toBe('n'); // número, no texto
    expect(ingresos?.v).toBe(2752.68);
    expect(ingresos?.z).toContain('€');

    const movimientos = wb.Sheets['Movimientos'];
    const totalRow = events.length + 2;
    const totalCell = movimientos?.[`G${totalRow}`];
    expect(totalCell?.f).toBe(`SUM(G2:G${events.length + 1})`);
    // Valor precalculado: los lectores que no recalculan muestran el total correcto.
    expect(totalCell?.v).toBeCloseTo(4903.96, 2);
    expect(movimientos?.['A1']?.v).toBe('Fecha');

    const cats = wb.Sheets['Categorías'];
    expect(cats?.['A1']?.v).toBe('Categoría');
    const catTotal = cats?.[`C${snapshot.byCategory.length + 2}`];
    expect(catTotal?.f).toBe(`SUM(C2:C${snapshot.byCategory.length + 1})`);
  });

  it('PDF: firma, varias páginas y tamaño razonable', async () => {
    const result = await buildDocument(model(options({ format: 'pdf' })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const head = new TextDecoder().decode(result.value.slice(0, 8));
    expect(head.startsWith('%PDF-')).toBe(true);
    expect(result.value.length).toBeGreaterThan(3000);
    const text = new TextDecoder('latin1').decode(result.value);
    expect(text).toContain('/Type /Page');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // Contenido real del documento (streams inflados), no solo la envoltura.
    const contenido = extractPdfText(result.value);
    for (const esperado of ['Fintrack', 'Resumen', 'Total ingresos', 'Tasa de ahorro', 'Movimientos', 'Mercadona', '01/09/2026']) {
      expect(contenido).toContain(esperado);
    }
  });

  it('Word: firma zip y contiene el documento principal', async () => {
    const result = await buildDocument(model(options({ format: 'docx' })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.value.slice(0, 2)]).toEqual([0x50, 0x4b]);
    expect(result.value.length).toBeGreaterThan(3000);
    // Los nombres de entrada del zip viajan sin comprimir en la cabecera local.
    const text = new TextDecoder('latin1').decode(result.value);
    expect(text).toContain('word/document.xml');
    expect(text).toContain('word/styles.xml');
  });

  it('los tres formatos se generan también sin movimientos ni desglose', async () => {
    const o = options({ includeRawMovements: false, includeBreakdown: false });
    for (const format of ['xlsx', 'pdf', 'docx'] as const) {
      const result = await buildDocument(model({ ...o, format }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.length).toBeGreaterThan(1000);
    }
  });
});
