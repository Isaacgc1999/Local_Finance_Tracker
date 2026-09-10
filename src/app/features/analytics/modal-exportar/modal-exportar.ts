import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { formatRange } from '../../../core/format/date-format';
import { formatInteger } from '../../../core/format/percent-format';
import type { ExportOptions } from '../../../facades/analytics.facade';
import { Modal } from '../../../shared/components/modal/modal';
import { Toggle } from '../../../shared/components/toggle/toggle';

const FORMAT_LABEL: Readonly<Record<ExportOptions['format'], string>> = { xlsx: 'Excel', pdf: 'PDF', docx: 'Word' };

/**
 * Modal de opciones de exportación del handoff (480px): título «Exportar a
 * Excel», rango, tres toggles (gráficas / desglose por categoría /
 * movimientos en bruto con «N filas») y botonera Cancelar / Exportar.
 */
@Component({
  selector: 'ft-modal-exportar',
  imports: [FormsModule, Modal, Toggle],
  templateUrl: './modal-exportar.html',
  styleUrl: './modal-exportar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalExportar {
  readonly open = model<boolean>(false);
  readonly options = model.required<ExportOptions>();
  readonly rowCount = input<number>(0);
  readonly busy = input<boolean>(false);
  readonly exportar = output<ExportOptions>();

  protected readonly titulo = computed(() => `Exportar a ${FORMAT_LABEL[this.options().format]}`);
  protected readonly rango = computed(() => formatRange(this.options().range));
  readonly filas = computed(() => `${formatInteger(this.rowCount())} filas`);

  protected set(key: 'includeCharts' | 'includeBreakdown' | 'includeRawMovements', value: boolean): void {
    this.options.update((o) => ({ ...o, [key]: value }));
  }

  protected cerrar(): void {
    this.open.set(false);
  }

  protected confirmar(): void {
    this.exportar.emit(this.options());
  }
}
