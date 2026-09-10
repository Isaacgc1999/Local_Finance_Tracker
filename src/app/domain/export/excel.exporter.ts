import type { CellObject, WorkSheet } from 'xlsx';

import { messageOf } from '../../core/errors/app-error';
import { currencySymbol } from '../../core/format/money-format';
import { type Result, tryCatch } from '../../core/types/result';
import { CATEGORY_HEADERS, type ExportModel, MOVEMENT_HEADERS } from './export-model';

/** Formato de moneda es-ES real (no texto): millar, dos decimales y negativos en rojo. */
function currencyFmt(): string {
  const s = currencySymbol();
  return `#.##0,00\ "${s}";[Red]-#.##0,00\ "${s}"`;
}
const PERCENT_FMT = '0,0%';

/**
 * Excel con SheetJS: hojas Resumen / Movimientos / Categorías, importes como
 * números con formato de moneda y filas de totales con fórmulas SUM vivas
 * (recalculan al editar en Excel).
 *
 * Los gráficos no se insertan como imagen (SheetJS no escribe dibujos en
 * xlsx): a cambio, la hoja Resumen lleva el desglose numérico que los
 * alimenta, así que el contenido informativo es el mismo que en PDF y Word.
 */
export async function buildXlsx(model: ExportModel): Promise<Result<Uint8Array>> {
  return tryCatch(
    async () => {
      const XLSX = await import('xlsx');
      const { utils, write } = XLSX;

      /** Fórmula viva + valor precalculado, para que se lea bien aunque el lector no recalcule. */
      const setFormula = (ws: WorkSheet, address: string, formula: string, value: number, z?: string): void => {
        const cell: CellObject = { t: 'n', f: formula, v: value };
        if (z) cell.z = z;
        ws[address] = cell;
        const ref = ws['!ref'];
        if (ref) {
          const range = utils.decode_range(ref);
          const target = utils.decode_cell(address);
          range.e.r = Math.max(range.e.r, target.r);
          range.e.c = Math.max(range.e.c, target.c);
          ws['!ref'] = utils.encode_range(range);
        }
      };

      const setFormat = (ws: WorkSheet, r: number, c: number, z: string): void => {
        const cell = ws[utils.encode_cell({ r, c })] as CellObject | undefined;
        if (cell && cell.t === 'n') cell.z = z;
      };

      const wb = utils.book_new();

      // ── Resumen ────────────────────────────────────────────────────────
      const resumen: (string | number | null)[][] = [
        [model.title],
        [model.subtitle],
        ['Periodo', model.periodText],
        [model.generatedAtText],
        [],
        ['Resumen'],
        ['Concepto', 'Valor'],
        ...model.summary.map((r) => [r.label, r.euros ?? r.text]),
        [],
        ['Desglose por tipo de gasto'],
        ['Tipo', 'Importe', '% del gasto'],
        ...model.kinds.map((k) => [k.label, k.euros, k.shareText]),
      ];
      const wsResumen = utils.aoa_to_sheet(resumen);
      wsResumen['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 14 }];
      const summaryFirstRow = 7; // índice 0 de la primera métrica
      model.summary.forEach((_, i) => setFormat(wsResumen, summaryFirstRow + i, 1, currencyFmt()));
      const kindsFirstRow = summaryFirstRow + model.summary.length + 3;
      model.kinds.forEach((_, i) => setFormat(wsResumen, kindsFirstRow + i, 1, currencyFmt()));
      utils.book_append_sheet(wb, wsResumen, 'Resumen');

      // ── Movimientos ────────────────────────────────────────────────────
      if (model.options.includeRawMovements) {
        const filas: (string | number)[][] = [
          [...MOVEMENT_HEADERS],
          ...model.movements.map((m) => [m.date, m.type, m.concept, m.category, m.nature, m.paymentMethod, m.euros, m.notes]),
        ];
        const ws = utils.aoa_to_sheet(filas);
        const lastDataRow = filas.length; // 1-indexado
        const totalRow = lastDataRow + 1;
        for (let r = 1; r < lastDataRow; r++) setFormat(ws, r, 6, currencyFmt());
        utils.sheet_add_aoa(ws, [['Total']], { origin: `A${totalRow}` });
        const totalMovimientos = model.movements.reduce((acc, m) => acc + m.euros, 0);
        setFormula(ws, `G${totalRow}`, `SUM(G2:G${lastDataRow})`, Math.round(totalMovimientos * 100) / 100, currencyFmt());
        ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 40 }];
        ws['!autofilter'] = { ref: `A1:H${lastDataRow}` };
        utils.book_append_sheet(wb, ws, 'Movimientos');
      }

      // ── Categorías ─────────────────────────────────────────────────────
      if (model.options.includeBreakdown) {
        const filas: (string | number)[][] = [
          [...CATEGORY_HEADERS],
          ...model.categories.map((c) => [
            c.label,
            c.count,
            c.total / 100,
            (c.shareOfExpensesBp ?? 0) / 10000,
            (c.shareOfIncomeBp ?? 0) / 10000,
            (c.averagePerEvent ?? 0) / 100,
            (c.deltaVsPreviousBp ?? 0) / 10000,
          ]),
        ];
        const ws = utils.aoa_to_sheet(filas);
        const lastDataRow = filas.length;
        const totalRow = lastDataRow + 1;
        for (let r = 1; r < lastDataRow; r++) {
          setFormat(ws, r, 2, currencyFmt());
          setFormat(ws, r, 5, currencyFmt());
          setFormat(ws, r, 3, PERCENT_FMT);
          setFormat(ws, r, 4, PERCENT_FMT);
          setFormat(ws, r, 6, PERCENT_FMT);
        }
        utils.sheet_add_aoa(ws, [['Total']], { origin: `A${totalRow}` });
        const totalCuenta = model.categories.reduce((acc, c) => acc + c.count, 0);
        const totalImporte = model.categories.reduce((acc, c) => acc + c.total, 0) / 100;
        const totalCuota = model.categories.reduce((acc, c) => acc + (c.shareOfExpensesBp ?? 0), 0) / 10000;
        setFormula(ws, `B${totalRow}`, `SUM(B2:B${lastDataRow})`, totalCuenta);
        setFormula(ws, `C${totalRow}`, `SUM(C2:C${lastDataRow})`, Math.round(totalImporte * 100) / 100, currencyFmt());
        setFormula(ws, `D${totalRow}`, `SUM(D2:D${lastDataRow})`, totalCuota, PERCENT_FMT);
        ws['!cols'] = [{ wch: 24 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
        utils.book_append_sheet(wb, ws, 'Categorías');
      }

      const out = write(wb, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer;
      return new Uint8Array(out);
    },
    (cause) => ({ kind: 'export', message: `No se pudo generar el Excel: ${messageOf(cause)}` }),
  );
}
