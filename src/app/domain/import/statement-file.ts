import { messageOf, validationError } from '../../core/errors/app-error';
import { type Result, err, ok, tryCatch } from '../../core/types/result';

/** Celda tal cual sale del fichero: texto en CSV; número o texto en Excel. */
export type Cell = string | number | null;

export type SheetRows = readonly (readonly Cell[])[];

export interface StatementSheet {
  readonly fileName: string;
  readonly format: 'csv' | 'excel';
  readonly rows: SheetRows;
}

export const STATEMENT_EXTENSIONS = ['csv', 'txt', 'xlsx', 'xls', 'ods'] as const;

const MAX_BYTES = 10 * 1024 * 1024;

function extensionOf(fileName: string): string {
  return (fileName.split('.').pop() ?? '').toLowerCase();
}

/**
 * Lee un extracto bancario (CSV o Excel) a una matriz de celdas. No
 * interpreta nada: la cabecera, las fechas y los importes los resuelve
 * `statement-columns`.
 */
export async function readStatementFile(fileName: string, bytes: Uint8Array): Promise<Result<StatementSheet>> {
  if (bytes.byteLength === 0) return err(validationError('file', 'El fichero está vacío.'));
  if (bytes.byteLength > MAX_BYTES) return err(validationError('file', 'El fichero supera los 10 MB.'));
  const ext = extensionOf(fileName);
  if (ext === 'csv' || ext === 'txt') {
    return ok({ fileName, format: 'csv', rows: parseCsv(decodeText(bytes)) });
  }
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
    const rows = await readWorkbook(bytes);
    if (!rows.ok) return rows;
    return ok({ fileName, format: 'excel', rows: rows.value });
  }
  return err(validationError('file', 'Formato no admitido. Usa CSV o Excel (.xlsx, .xls).'));
}

/** UTF-8 si es válido; si no, Windows-1252 (el habitual en las exportaciones de bancos españoles). */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const DELIMITERS = [';', ',', '\t', '|'] as const;

/** Separador más frecuente fuera de comillas en las primeras líneas con contenido. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 30);
  let best: string = ',';
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, d));
    const score = counts.reduce((a, b) => a + b, 0);
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let n = 0;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) n++;
  }
  return n;
}

/**
 * CSV RFC 4180 (comillas dobles, saltos de línea dentro de comillas). Las
 * filas vacías se conservan como `[]` para que el nº de fila coincida con
 * el del fichero.
 */
export function parseCsv(text: string, delimiter: string = detectDelimiter(text)): SheetRows {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let inQuotes = false;
  const pushRow = (): void => {
    row.push(field);
    field = '';
    const cells = row.map((c) => (c === null ? null : String(c).trim() || null));
    rows.push(cells.some((c) => c !== null) ? cells : []);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) pushRow();
  while (rows.length > 0 && rows[rows.length - 1]?.length === 0) rows.pop();
  return rows;
}

/**
 * Primera hoja con contenido. Las fechas llegan como número de serie de
 * Excel (sin `cellDates`) para no depender de la zona horaria del equipo.
 */
async function readWorkbook(bytes: Uint8Array): Promise<Result<SheetRows>> {
  return tryCatch(
    async () => {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(bytes, { type: 'array', cellDates: false, dense: true });
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        if (!ws) continue;
        // Desde A1 y con filas vacías, para que el nº de fila coincida con el de Excel.
        const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
        if (range) ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: range.e });
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
        const rows = raw.map((r) => {
          const cells = r.map(toCell);
          return cells.some((c) => c !== null) ? cells : [];
        });
        if (rows.some((r) => r.length > 0)) return rows as SheetRows;
      }
      throw new Error('El libro no tiene ninguna hoja con datos.');
    },
    (cause) => validationError('file', `No se pudo leer el Excel: ${messageOf(cause)}`),
  );
}

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  return text === '' ? null : text;
}
