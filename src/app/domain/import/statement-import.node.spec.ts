/**
 * Importador de extractos: lectura de CSV/Excel reales (el Excel se genera
 * con SheetJS), detección de cabecera, parseo de fechas e importes y
 * duplicados contra SQLite real.
 */
import * as XLSX from 'xlsx';

import { NodeSqliteDatabase } from '../../../../tools/node-sqlite-database';
import { SYSTEM_CATEGORY } from '../../core/types/category';
import type { EventDraft } from '../../core/types/event';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { MIGRATIONS } from '../../data/db/migrations';
import { applyPendingMigrations } from '../../data/db/migrator';
import { type Repositories, createRepositories } from '../../data/repositories';
import { detectColumns, parseAmountCell, parseDateCell } from './statement-columns';
import { parseCsv, readStatementFile } from './statement-file';
import {
  DEFAULT_IMPORT_CATEGORIES,
  StatementImportService,
  buildPreview,
  parseRows,
  selectedByDefault,
} from './statement-import';

async function freshRepos(): Promise<Repositories> {
  const db = NodeSqliteDatabase.open();
  const migrated = await applyPendingMigrations(db, MIGRATIONS);
  if (!migrated.ok) throw new Error('migraciones');
  return createRepositories(db);
}

/** Excel con la forma de la exportación de Santander España: título, IBAN, línea vacía y cabecera. */
function santanderXlsx(dataRows: (string | number)[][]): Uint8Array {
  const aoa = [
    ['Movimientos de la cuenta'],
    ['Cuenta', 'ES12 0049 1234 5612 3456 7890'],
    [],
    ['Fecha operación', 'Fecha valor', 'Concepto', 'Importe', 'Saldo', 'Divisa'],
    ...dataRows,
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Movimientos');
  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}

const OPTIONS = {
  fileName: 'extracto.xlsx',
  accountId: null,
  expenseCategoryId: DEFAULT_IMPORT_CATEGORIES.expense,
  incomeCategoryId: DEFAULT_IMPORT_CATEGORIES.income,
};

describe('parseAmountCell', () => {
  it.each([
    ['-1.234,56', -123456],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['-12,30 €', -1230],
    ['12.30', 1230],
    ['(45,00)', -4500],
    ['45,00-', -4500],
    ['+2.500,00', 250000],
    ['1.234', 123400],
    ['0,29', 29],
    ['\u221212,30\u00a0€', -1230],
    ['-1 234,56', -123456],
    ['EUR -5,00', -500],
    ['abc', null],
    ['', null],
  ])('%s → %s', (input, expected) => {
    expect(parseAmountCell(input)).toBe(expected);
  });

  it('números de Excel', () => {
    expect(parseAmountCell(-72.41)).toBe(-7241);
    expect(parseAmountCell(0.29)).toBe(29);
  });
});

describe('parseDateCell', () => {
  it('día primero por defecto, AAAA-MM-DD y serie de Excel', () => {
    expect(parseDateCell('05/09/2026')).toBe('2026-09-05');
    expect(parseDateCell('5-9-26')).toBe('2026-09-05');
    expect(parseDateCell('2026-09-05')).toBe('2026-09-05');
    expect(parseDateCell('05.09.2026 10:30')).toBe('2026-09-05');
    expect(parseDateCell(46270)).toBe('2026-09-05');
    expect(parseDateCell('31/02/2026')).toBeNull();
    expect(parseDateCell('09/05/2026', 'mdy')).toBe('2026-09-05');
  });
});

describe('detectColumns', () => {
  it('encuentra la cabecera de Santander bajo las filas de título', () => {
    const rows = parseCsv(
      'Movimientos;\nCuenta;ES12\n\nFecha operación;Fecha valor;Concepto;Importe;Saldo;Divisa\n25/09/2026;25/09/2026;Bizum;-10,00;90,00;EUR\n',
    );
    expect(detectColumns(rows)).toEqual({ headerRow: 3, date: 0, concept: 2, amount: 3, debit: null, credit: null, currency: 5 });
  });

  it('cargos y abonos en columnas separadas', () => {
    const rows = parseCsv('Fecha,Descripción,Cargo,Abono\n01/09/2026,Luz,"45,10",\n02/09/2026,Nómina,,"1.800,00"\n');
    const mapping = detectColumns(rows);
    expect(mapping).toMatchObject({ date: 0, concept: 1, amount: null, debit: 2, credit: 3 });
    const parsed = parseRows(rows, mapping!, 'EUR');
    expect(parsed.map((p) => p.signedCents)).toEqual([-4510, 180000]);
  });

  it('variantes reales: espacios duros, «Importe (€)», mayúsculas y fechas con hora', () => {
    const rows = parseCsv(
      [
        'Banco Santander;;;',
        'IBAN;ES12 0049 1234 5612 3456 7890;;',
        'Titular;ISAAC;;',
        '',
        'FECHA OPERACIÓN\u00a0;FECHA VALOR;CONCEPTO ;IMPORTE (€);SALDO (€)',
        '25/09/2026 00:00:00;25/09/2026;COMPRA TARJ. 5417 MERCADONA;"-1.072,41";927,59',
        'Saldo final;;;;927,59',
      ].join('\n'),
    );
    const mapping = detectColumns(rows);
    expect(mapping).toMatchObject({ headerRow: 4, date: 0, concept: 2, amount: 3 });
    const parsed = parseRows(rows, mapping!, 'EUR');
    expect(parsed).toEqual([
      { line: 6, date: '2026-09-25', concept: 'COMPRA TARJ. 5417 MERCADONA', signedCents: -107241, error: null },
    ]);
  });

  it('null si no reconoce las columnas (la UI pide el mapeo)', () => {
    expect(detectColumns(parseCsv('a,b,c\n1,2,3\n'))).toBeNull();
  });
});

describe('readStatementFile', () => {
  it('lee un Excel de Santander con fechas de texto sin mapeo manual', async () => {
    const bytes = santanderXlsx([
      ['25/09/2026', '25/09/2026', 'COMPRA TARJ. 5417 MERCADONA', -72.41, 1927.59, 'EUR'],
      ['24/09/2026', '24/09/2026', 'TRANSFERENCIA NOMINA ACME SL', 1800, 2000, 'EUR'],
    ]);
    const sheet = await readStatementFile('export.xlsx', bytes);
    expect(sheet.ok).toBe(true);
    if (!sheet.ok) return;
    const mapping = detectColumns(sheet.value.rows);
    expect(mapping).not.toBeNull();
    const parsed = parseRows(sheet.value.rows, mapping!, 'EUR');
    expect(parsed).toEqual([
      { line: 5, date: '2026-09-25', concept: 'COMPRA TARJ. 5417 MERCADONA', signedCents: -7241, error: null },
      { line: 6, date: '2026-09-24', concept: 'TRANSFERENCIA NOMINA ACME SL', signedCents: 180000, error: null },
    ]);
  });

  it('lee fechas guardadas como fecha de Excel (número de serie)', async () => {
    const bytes = santanderXlsx([[46290, 46290, 'Recibo luz', -45.1, 100, 'EUR']]);
    const sheet = await readStatementFile('export.xlsx', bytes);
    if (!sheet.ok) throw new Error('lectura');
    const parsed = parseRows(sheet.value.rows, detectColumns(sheet.value.rows)!, 'EUR');
    expect(parsed[0]?.date).toBe('2026-09-25');
  });

  it('CSV en Windows-1252 con punto y coma', async () => {
    const text = 'Fecha;Concepto;Importe\n01/09/2026;Café Ñandú;-2,50\n';
    const bytes = Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
    const sheet = await readStatementFile('mov.csv', bytes);
    if (!sheet.ok) throw new Error('lectura');
    expect(sheet.value.rows[1]).toEqual(['01/09/2026', 'Café Ñandú', '-2,50']);
  });

  it('rechaza formatos desconocidos', async () => {
    const r = await readStatementFile('extracto.pdf', new Uint8Array([1]));
    expect(!r.ok && r.error.kind).toBe('validation');
  });
});

describe('parseRows', () => {
  it('marca filas inválidas y omite pies sin fecha ni importe', () => {
    const rows = parseCsv('Fecha;Concepto;Importe;Divisa\n01/09/2026;A;-1,00;EUR\nxx;B;-2,00;EUR\n01/09/2026;C;0;EUR\n01/09/2026;D;-3,00;USD\nTotal;;;\n');
    const parsed = parseRows(rows, detectColumns(rows)!, 'EUR');
    expect(parsed.map((p) => [p.concept, p.error !== null])).toEqual([
      ['A', false],
      ['B', true],
      ['C', true],
      ['D', true],
    ]);
  });
});

describe('buildPreview y StatementImportService', () => {
  const existente = (overrides: Partial<EventDraft> = {}): EventDraft => ({
    type: 'expense',
    amountCents: money(7241),
    date: isoDate(2026, 9, 25),
    concept: 'Compra tarj. 5417 Mercadona',
    categoryId: SYSTEM_CATEGORY.alimentacion,
    nature: 'variable',
    paymentMethod: null,
    notes: null,
    attachmentPath: null,
    recurrenceId: null,
    accountId: null,
    meta: { type: 'expense' },
    ...overrides,
  });

  it('distingue duplicados exactos, posibles y nuevos, y cada existente cuenta una vez', async () => {
    const repos = await freshRepos();
    await repos.events.insert(existente());
    await repos.events.insert(existente({ concept: 'Súper', amountCents: money(1500), date: isoDate(2026, 9, 20) }));

    const rows = parseCsv(
      [
        'Fecha;Concepto;Importe',
        '25/09/2026;COMPRA TARJ. 5417 MERCADONA;-72,41', // exacto (normalizado)
        '25/09/2026;COMPRA TARJ. 5417 MERCADONA;-72,41', // segundo igual: nuevo
        '20/09/2026;CARREFOUR EXPRESS;-15,00', // mismo día e importe, otro concepto
        '21/09/2026;BIZUM DE ANA;25,00', // nuevo ingreso
      ].join('\n'),
    );
    const parsed = parseRows(rows, detectColumns(rows)!, 'EUR');
    const service = new StatementImportService(repos);
    const preview = await service.preview(parsed);
    if (!preview.ok) throw new Error('preview');
    expect(preview.value.rows.map((r) => r.status)).toEqual(['duplicate', 'new', 'possible_duplicate', 'new']);
    expect(preview.value.rows[2]?.matchedConcept).toBe('Súper');
    expect(preview.value.counts).toEqual({ new: 2, duplicate: 1, possible_duplicate: 1, invalid: 0 });

    const chosen = preview.value.rows.filter(selectedByDefault);
    const saved = await service.commit(chosen, OPTIONS);
    expect(saved.ok && saved.value.inserted).toBe(2);

    const all = await repos.events.findInRange({ from: isoDate(2026, 9, 1), to: isoDate(2026, 9, 30) });
    if (!all.ok) throw new Error('lectura');
    const bizum = all.value.find((e) => e.concept === 'BIZUM DE ANA');
    expect(bizum).toMatchObject({ type: 'income', amountCents: 2500, categoryId: SYSTEM_CATEGORY.otrosIngresos, notes: 'Importado de extracto.xlsx' });

    // Reimportar el mismo fichero ya no trae nada nuevo.
    const again = await service.preview(parsed);
    expect(again.ok && again.value.counts.new).toBe(0);
  });

  it('las filas inválidas nunca se guardan', () => {
    const rows = parseCsv('Fecha;Concepto;Importe\nxx;A;-1,00\n');
    const preview = buildPreview(parseRows(rows, detectColumns(rows)!, 'EUR'), []);
    expect(preview.rows[0]?.status).toBe('invalid');
    expect(selectedByDefault(preview.rows[0]!)).toBe(false);
  });
});
