import { messageOf } from '../../core/errors/app-error';
import { formatMoney } from '../../core/format/money-format';
import { money } from '../../core/types/money';
import { type Result, tryCatch } from '../../core/types/result';
import { FT_COLORS } from '../../shared/charts/palette';
import { CATEGORY_HEADERS, type ExportModel, MOVEMENT_HEADERS, categoryTotalsRow } from './export-model';

const hex = (c: string) => c.replace('#', '');

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Word con `docx`: estilos reales (Title, Heading1, Heading2, párrafos con
 * espaciado), tablas con cabecera repetida y bordes, y los gráficos como
 * imágenes PNG. Mismo contenido que Excel y PDF.
 */
export async function buildDocx(model: ExportModel): Promise<Result<Uint8Array>> {
  return tryCatch(
    async () => {
      const d = await import('docx');
      const { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, BorderStyle } = d;

      const border = { style: BorderStyle.SINGLE, size: 2, color: 'E2E5EA' };
      const cellBorders = { top: border, bottom: border, left: border, right: border };

      const celda = (text: string, opts: { bold?: boolean; right?: boolean; fill?: string; color?: string } = {}) =>
        new TableCell({
          borders: cellBorders,
          ...(opts.fill ? { shading: { fill: opts.fill } } : {}),
          children: [
            new Paragraph({
              alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text, bold: opts.bold ?? false, size: 18, color: opts.color ?? '282C34' })],
            }),
          ],
        });

      const tabla = (headers: readonly string[], rows: readonly (readonly string[])[], opts: { headFill?: string; foot?: readonly string[]; rightFrom?: number } = {}) => {
        const rightFrom = opts.rightFrom ?? 1;
        const headFill = opts.headFill ?? hex(FT_COLORS.accent);
        const filas = [
          new TableRow({
            tableHeader: true,
            children: headers.map((h, i) => celda(h, { bold: true, right: i >= rightFrom, fill: headFill, color: 'FFFFFF' })),
          }),
          ...rows.map((r) => new TableRow({ children: r.map((c, i) => celda(c, { right: i >= rightFrom })) })),
        ];
        if (opts.foot) {
          filas.push(new TableRow({ children: opts.foot.map((c, i) => celda(c, { bold: true, right: i >= rightFrom, fill: 'F0F2F6' })) }));
        }
        return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: filas });
      };

      const children: InstanceType<typeof Paragraph | typeof Table>[] = [
        new Paragraph({ text: model.title, heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: model.subtitle, size: 28, color: '3C4048' })], spacing: { after: 120 } }),
        new Paragraph({ children: [new TextRun({ text: `Periodo: ${model.periodText}`, size: 20, color: '6E747E' })] }),
        new Paragraph({ children: [new TextRun({ text: model.generatedAtText, size: 20, color: '6E747E' })], spacing: { after: 320 } }),

        new Paragraph({ text: 'Resumen', heading: HeadingLevel.HEADING_1, spacing: { after: 160 } }),
        tabla(['Concepto', 'Valor'], model.summary.map((r) => [r.label, r.text])),
      ];

      for (const chart of model.charts) {
        const ratio = chart.heightPx / chart.widthPx;
        const width = 600;
        children.push(
          new Paragraph({ text: chart.title, heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 160 } }),
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: dataUrlToUint8(chart.dataUrl),
                transformation: { width, height: Math.round(width * ratio) },
              }),
            ],
          }),
        );
      }

      children.push(
        new Paragraph({ text: 'Desglose por tipo de gasto', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 160 } }),
        tabla(
          ['Tipo', 'Importe', '% del gasto'],
          model.kinds.map((k) => [k.label, formatMoney(money(k.amount)), k.shareText]),
          { headFill: hex(FT_COLORS.expense) },
        ),
      );

      if (model.options.includeBreakdown && model.categoryRows.length > 0) {
        children.push(
          new Paragraph({ text: 'Desglose por categoría', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 160 } }),
          tabla(CATEGORY_HEADERS, model.categoryRows, { foot: categoryTotalsRow(model.snapshot) }),
        );
      }

      if (model.options.includeRawMovements && model.movements.length > 0) {
        children.push(
          new Paragraph({ text: 'Movimientos', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 160 }, pageBreakBefore: true }),
          tabla(
            MOVEMENT_HEADERS,
            model.movements.map((m) => [
              m.date,
              m.type,
              m.concept,
              m.category,
              m.nature,
              m.paymentMethod,
              formatMoney(money(Math.round(m.euros * 100))),
              m.notes,
            ]),
            { rightFrom: 6 },
          ),
        );
      }

      const doc = new Document({
        creator: 'Fintrack',
        title: `${model.title} · ${model.periodText}`,
        description: 'Informe de finanzas personales generado localmente',
        styles: {
          default: {
            document: { run: { font: 'Calibri', size: 22, color: '282C34' } },
            title: { run: { font: 'Calibri', size: 44, bold: true, color: '14161A' }, paragraph: { spacing: { after: 120 } } },
            heading1: { run: { font: 'Calibri', size: 30, bold: true, color: '14161A' }, paragraph: { spacing: { before: 240, after: 120 } } },
            heading2: { run: { font: 'Calibri', size: 26, bold: true, color: '3C4048' }, paragraph: { spacing: { before: 200, after: 100 } } },
          },
        },
        sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }],
      });

      const buffer = await Packer.toArrayBuffer(doc);
      return new Uint8Array(buffer);
    },
    (cause) => ({ kind: 'export', message: `No se pudo generar el documento de Word: ${messageOf(cause)}` }),
  );
}
