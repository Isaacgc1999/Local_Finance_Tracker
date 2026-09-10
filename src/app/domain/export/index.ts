import type { Result } from '../../core/types/result';
import type { ExportFormat, ExportModel } from './export-model';

export * from './export-model';

/** Carga perezosa: cada librería (SheetJS, jsPDF, docx) solo entra si se usa su formato. */
export async function buildDocument(model: ExportModel): Promise<Result<Uint8Array>> {
  switch (model.options.format) {
    case 'xlsx': {
      const { buildXlsx } = await import('./excel.exporter');
      return buildXlsx(model);
    }
    case 'pdf': {
      const { buildPdf } = await import('./pdf.exporter');
      return buildPdf(model);
    }
    case 'docx': {
      const { buildDocx } = await import('./docx.exporter');
      return buildDocx(model);
    }
  }
}

export type { ExportFormat };
