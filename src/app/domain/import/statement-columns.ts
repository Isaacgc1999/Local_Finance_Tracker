import { type IsoDate, isIsoDate } from '../../core/types/iso-date';
import type { Cell, SheetRows } from './statement-file';

/** Columnas que el importador sabe usar. `valueDate` y `balance` se reconocen para no confundirlas con otras. */
export type StatementField = 'date' | 'valueDate' | 'concept' | 'amount' | 'debit' | 'credit' | 'balance' | 'currency';

/**
 * Qué columna es cada cosa (índice 0) y en qué fila está la cabecera.
 * O bien `amount` (con signo), o bien `debit`/`credit` (cargos y abonos en
 * columnas separadas).
 */
export interface ColumnMapping {
  readonly headerRow: number;
  readonly date: number | null;
  readonly concept: number | null;
  readonly amount: number | null;
  readonly debit: number | null;
  readonly credit: number | null;
  readonly currency: number | null;
}

export const EMPTY_MAPPING: ColumnMapping = {
  headerRow: 0,
  date: null,
  concept: null,
  amount: null,
  debit: null,
  credit: null,
  currency: null,
};

/** Sinónimos ya normalizados (minúsculas, sin tildes). El orden de campos es la prioridad. */
const SYNONYMS: Readonly<Record<StatementField, readonly string[]>> = {
  valueDate: ['fecha valor', 'f. valor', 'f valor', 'value date', 'fecha de valor'],
  date: [
    'fecha operacion',
    'fecha de operacion',
    'f. operacion',
    'f operacion',
    'fecha',
    'fecha contable',
    'fecha movimiento',
    'date',
    'transaction date',
    'booking date',
    'started date',
    'completed date',
  ],
  concept: ['concepto', 'descripcion', 'description', 'concept', 'detalle', 'movimiento', 'beneficiario', 'payee', 'memo', 'texto'],
  amount: ['importe', 'amount', 'cantidad', 'monto', 'importe eur', 'importe (eur)', 'importe euros'],
  debit: ['cargo', 'cargos', 'debe', 'debit', 'salida', 'salidas', 'money out', 'paid out'],
  credit: ['abono', 'abonos', 'haber', 'credit', 'entrada', 'entradas', 'money in', 'paid in'],
  balance: ['saldo', 'balance', 'saldo disponible', 'saldo contable'],
  currency: ['divisa', 'moneda', 'currency'],
};

const FIELD_ORDER: readonly StatementField[] = ['valueDate', 'date', 'concept', 'amount', 'debit', 'credit', 'balance', 'currency'];

export function normalizeHeader(value: Cell): string {
  if (value === null) return '';
  return String(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[:*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Campo al que corresponde una cabecera: primero coincidencia exacta, luego por prefijo («Importe (€)»). */
function fieldOf(header: string): StatementField | null {
  if (!header) return null;
  for (const f of FIELD_ORDER) if (SYNONYMS[f].includes(header)) return f;
  for (const f of FIELD_ORDER) {
    if (SYNONYMS[f].some((s) => header.startsWith(`${s} `) || header.startsWith(`${s}(`))) return f;
  }
  return null;
}

function mappingForRow(row: readonly Cell[], headerRow: number): { mapping: ColumnMapping; score: number } {
  const found: Partial<Record<StatementField, number>> = {};
  row.forEach((cell, i) => {
    const f = fieldOf(normalizeHeader(cell));
    if (f && found[f] === undefined) found[f] = i;
  });
  const mapping: ColumnMapping = {
    headerRow,
    date: found.date ?? found.valueDate ?? null,
    concept: found.concept ?? null,
    amount: found.amount ?? null,
    debit: found.debit ?? null,
    credit: found.credit ?? null,
    currency: found.currency ?? null,
  };
  return { mapping, score: Object.keys(found).length };
}

export function isMappingComplete(m: ColumnMapping): boolean {
  return m.date !== null && m.concept !== null && (m.amount !== null || m.debit !== null || m.credit !== null);
}

/**
 * Busca la fila de cabecera entre las primeras 40 (los bancos suelen poner
 * antes el titular, el IBAN y el periodo). Gana la fila completa con más
 * columnas reconocidas. `null` si ninguna sirve: la UI pide el mapeo a mano.
 */
export function detectColumns(rows: SheetRows): ColumnMapping | null {
  let best: { mapping: ColumnMapping; score: number } | null = null;
  const limit = Math.min(rows.length, 40);
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!row) continue;
    const candidate = mappingForRow(row, r);
    if (!isMappingComplete(candidate.mapping)) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best?.mapping ?? null;
}

/** Etiqueta de cada columna para los selectores del mapeo manual. */
export function columnLabels(rows: SheetRows, headerRow: number): readonly string[] {
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const header = rows[headerRow] ?? [];
  return Array.from({ length: width }, (_, i) => {
    const h = header[i];
    const letter = columnLetter(i);
    return h === null || h === undefined || String(h).trim() === '' ? `Columna ${letter}` : `${letter} · ${String(h).trim()}`;
  });
}

function columnLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ── Celdas ───────────────────────────────────────────────────────────────

export type DateOrder = 'dmy' | 'mdy';

/** Número de serie de Excel (sistema 1900) → fecha ISO. */
function fromExcelSerial(serial: number): IsoDate | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const ms = Math.round((Math.floor(serial) - 25569) * 86400000);
  const iso = new Date(ms).toISOString().slice(0, 10);
  return isIsoDate(iso) ? iso : null;
}

const DATE_RE = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/;

/**
 * Fecha de una celda. Admite número de serie de Excel, `AAAA-MM-DD`,
 * `DD/MM/AAAA`, `DD-MM-AA` y `DD.MM.AAAA`. Día primero salvo que el fichero
 * delate el orden americano (ver `detectDateOrder`).
 */
export function parseDateCell(cell: Cell, order: DateOrder = 'dmy'): IsoDate | null {
  if (cell === null) return null;
  if (typeof cell === 'number') return fromExcelSerial(cell);
  const text = cell.trim();
  if (/^\d+(\.\d+)?$/.test(text) && Number(text) > 20000) return fromExcelSerial(Number(text));
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const [a, b, c] = [m[1] ?? '', m[2] ?? '', m[3] ?? ''];
  let y: number;
  let mo: number;
  let d: number;
  if (a.length === 4) {
    [y, mo, d] = [Number(a), Number(b), Number(c)];
  } else {
    y = Number(c);
    if (c.length <= 2) y += 2000;
    [d, mo] = order === 'dmy' ? [Number(a), Number(b)] : [Number(b), Number(a)];
  }
  const iso = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** `mdy` solo si alguna fecha de texto tiene más de 12 en la segunda posición y ninguna en la primera. */
export function detectDateOrder(cells: readonly Cell[]): DateOrder {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const cell of cells) {
    if (typeof cell !== 'string') continue;
    const m = DATE_RE.exec(cell.trim());
    if (!m || (m[1] ?? '').length === 4) continue;
    if (Number(m[1]) > 12) firstOver12 = true;
    if (Number(m[2]) > 12) secondOver12 = true;
  }
  return secondOver12 && !firstOver12 ? 'mdy' : 'dmy';
}

/**
 * Importe con signo en céntimos. Entiende «-1.234,56», «1,234.56»,
 * «12,30 €», «(45,00)», «45,00-» y números de Excel. `null` si no es un importe.
 */
export function parseAmountCell(cell: Cell): number | null {
  if (cell === null) return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? Math.round(cell * 100) : null;
  // Espacios duros y el signo menos tipográfico (U+2212) o guiones largos que algunos bancos usan como signo.
  let text = cell
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[€$£]|EUR|USD|GBP/gi, '');
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Ambos: el último es el decimal.
    normalized = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const parts = text.split(',');
    normalized = parts.length > 2 || isThousands(parts) ? parts.join('') : text.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = text.split('.');
    normalized = parts.length > 2 || isThousands(parts) ? parts.join('') : text;
  } else {
    normalized = text;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** «1.234» o «1,234»: separador de millar (3 cifras detrás y parte entera sin ceros a la izquierda). */
function isThousands(parts: readonly string[]): boolean {
  return parts.length === 2 && (parts[1] ?? '').length === 3 && /^[1-9]\d{0,2}$/.test(parts[0] ?? '');
}

export function cellText(cell: Cell): string {
  if (cell === null) return '';
  return String(cell).replace(/\s+/g, ' ').trim();
}
