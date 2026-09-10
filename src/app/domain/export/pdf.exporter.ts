import { messageOf } from '../../core/errors/app-error';
import { formatMoney } from '../../core/format/money-format';
import { money } from '../../core/types/money';
import { type Result, tryCatch } from '../../core/types/result';
import { FT_COLORS } from '../../shared/charts/palette';
import { CATEGORY_HEADERS, type ExportModel, MOVEMENT_HEADERS, categoryTotalsRow } from './export-model';

const MARGIN = 40;
const PAGE_W = 595.28; // A4 vertical en puntos
const PAGE_H = 841.89;

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/**
 * PDF con jsPDF + autotable: portada con periodo, tabla de resumen, gráficos
 * insertados como PNG (`echarts.getDataURL()` a 2x), desglose por tipo de
 * gasto, tabla de categorías y listado de movimientos. Colores de la paleta
 * semántica del handoff sobre fondo claro (documento impreso).
 */
export async function buildPdf(model: ExportModel): Promise<Result<Uint8Array>> {
  return tryCatch(
    async () => {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
      const width = PAGE_W - MARGIN * 2;
      let y = MARGIN;

      // ── Portada ────────────────────────────────────────────────────────
      doc.setFillColor(...rgb(FT_COLORS.accent));
      doc.roundedRect(MARGIN, y, 28, 28, 8, 8, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(20, 22, 26);
      doc.text(model.title, MARGIN + 40, y + 20);
      y += 52;
      doc.setFont('helvetica', 'normal').setFontSize(14).setTextColor(60, 64, 72);
      doc.text(model.subtitle, MARGIN, y);
      y += 20;
      doc.setFontSize(10).setTextColor(110, 116, 126);
      doc.text(`Periodo: ${model.periodText}`, MARGIN, y);
      y += 14;
      doc.text(model.generatedAtText, MARGIN, y);
      y += 12;
      doc.setDrawColor(226, 229, 234).line(MARGIN, y, MARGIN + width, y);
      y += 22;

      // ── Resumen ────────────────────────────────────────────────────────
      doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20, 22, 26);
      doc.text('Resumen', MARGIN, y);
      y += 10;
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        head: [['Concepto', 'Valor']],
        body: model.summary.map((r) => [r.label, r.text]),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, lineColor: [232, 234, 238], textColor: [40, 44, 52] },
        headStyles: { fillColor: rgb(FT_COLORS.accent), textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 249, 251] },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

      // ── Gráficos ───────────────────────────────────────────────────────
      for (const chart of model.charts) {
        const imgH = Math.min(220, (width * chart.heightPx) / chart.widthPx);
        if (y + imgH + 30 > PAGE_H - MARGIN) {
          doc.addPage();
          y = MARGIN;
        }
        doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20, 22, 26);
        doc.text(chart.title, MARGIN, y);
        y += 12;
        doc.addImage(chart.dataUrl, 'PNG', MARGIN, y, width, imgH, undefined, 'FAST');
        y += imgH + 24;
      }

      // ── Desglose por tipo de gasto ─────────────────────────────────────
      if (y + 120 > PAGE_H - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20, 22, 26);
      doc.text('Desglose por tipo de gasto', MARGIN, y);
      y += 10;
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        head: [['Tipo', 'Importe', '% del gasto']],
        body: model.kinds.map((k) => [k.label, formatMoney(money(k.amount)), k.shareText]),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, lineColor: [232, 234, 238], textColor: [40, 44, 52] },
        headStyles: { fillColor: rgb(FT_COLORS.expense), textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

      // ── Categorías ─────────────────────────────────────────────────────
      if (model.options.includeBreakdown && model.categoryRows.length > 0) {
        if (y + 120 > PAGE_H - MARGIN) {
          doc.addPage();
          y = MARGIN;
        }
        doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20, 22, 26);
        doc.text('Desglose por categoría', MARGIN, y);
        y += 10;
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN },
          head: [[...CATEGORY_HEADERS]],
          body: model.categoryRows.map((r) => [...r]),
          foot: [[...categoryTotalsRow(model.snapshot)]],
          theme: 'grid',
          styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, lineColor: [232, 234, 238], textColor: [40, 44, 52] },
          headStyles: { fillColor: rgb(FT_COLORS.accent), textColor: [255, 255, 255], fontStyle: 'bold' },
          footStyles: { fillColor: [240, 242, 246], textColor: [20, 22, 26], fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
      }

      // ── Movimientos ────────────────────────────────────────────────────
      if (model.options.includeRawMovements && model.movements.length > 0) {
        doc.addPage();
        doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20, 22, 26);
        doc.text('Movimientos', MARGIN, MARGIN);
        autoTable(doc, {
          startY: MARGIN + 10,
          margin: { left: MARGIN, right: MARGIN },
          head: [[...MOVEMENT_HEADERS]],
          body: model.movements.map((m) => [
            m.date,
            m.type,
            m.concept,
            m.category,
            m.nature,
            m.paymentMethod,
            formatMoney(money(Math.round(m.euros * 100))),
            m.notes,
          ]),
          theme: 'striped',
          styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 3, textColor: [40, 44, 52], overflow: 'ellipsize' },
          headStyles: { fillColor: rgb(FT_COLORS.accent), textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 249, 251] },
          columnStyles: {
            0: { cellWidth: 52 },
            1: { cellWidth: 54 },
            3: { cellWidth: 58 },
            4: { cellWidth: 44 },
            5: { cellWidth: 56 },
            6: { cellWidth: 56, halign: 'right' },
          },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 6) {
              const negative = String(data.cell.raw).trim().startsWith('-');
              data.cell.styles.textColor = negative ? rgb(FT_COLORS.expense) : rgb(FT_COLORS.income);
            }
          },
        });
      }

      // ── Pie con paginación ─────────────────────────────────────────────
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(140, 146, 156);
        doc.text(`${model.title} · ${model.periodText}`, MARGIN, PAGE_H - 20);
        doc.text(`${i} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 20, { align: 'right' });
      }

      return new Uint8Array(doc.output('arraybuffer'));
    },
    (cause) => ({ kind: 'export', message: `No se pudo generar el PDF: ${messageOf(cause)}` }),
  );
}
