import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatDate } from '../../../core/format/date-format';
import { formatMoney } from '../../../core/format/money-format';
import type { IsoDate } from '../../../core/types/iso-date';
import type { Money } from '../../../core/types/money';
import type { ColumnMapping } from '../../../domain/import/statement-columns';
import { STATEMENT_EXTENSIONS } from '../../../domain/import/statement-file';
import type { ImportRow, ImportRowStatus } from '../../../domain/import/statement-import';
import { ImportFacade } from '../../../facades/import.facade';
import { CabeceraPagina } from '../../../layout/cabecera-pagina/cabecera-pagina';

type ColumnField = Exclude<keyof ColumnMapping, 'headerRow'>;

const STATUS_LABEL: Readonly<Record<ImportRowStatus, string>> = {
  new: 'Nuevo',
  duplicate: 'Ya existe',
  possible_duplicate: 'Posible duplicado',
  invalid: 'No válido',
};

/**
 * Importar extracto bancario (CSV o Excel). Detecta la cabecera sola
 * (Santander, cargos/abonos separados…); si no puede, pide qué columna es
 * cada cosa. La vista previa marca duplicados y solo se guarda al confirmar.
 */
@Component({
  selector: 'ft-importar',
  imports: [RouterLink, CabeceraPagina],
  templateUrl: './importar.html',
  styleUrl: './importar.scss',
  host: { class: 'ft-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Importar {
  protected readonly facade = inject(ImportFacade);

  protected readonly accept = STATEMENT_EXTENSIONS.map((e) => `.${e}`).join(',');
  protected readonly arrastrando = signal(false);
  protected readonly editarColumnas = signal(false);

  protected readonly campos: readonly { readonly key: ColumnField; readonly label: string; readonly hint: string }[] = [
    { key: 'date', label: 'Fecha', hint: '' },
    { key: 'concept', label: 'Concepto', hint: '' },
    { key: 'amount', label: 'Importe', hint: 'con signo' },
    { key: 'debit', label: 'Cargo', hint: 'si no hay importe' },
    { key: 'credit', label: 'Abono', hint: 'si no hay importe' },
    { key: 'currency', label: 'Divisa', hint: 'opcional' },
  ];

  protected readonly mostrarColumnas = computed(() => this.editarColumnas() || !this.facade.autoDetected() || !this.facade.mappingComplete());

  protected readonly resumenColumnas = computed(() => {
    const m = this.facade.mapping();
    const cols = this.facade.columns();
    const name = (i: number | null) => (i === null ? '' : (cols[i] ?? ''));
    const importe = m.amount !== null ? name(m.amount) : [name(m.debit), name(m.credit)].filter(Boolean).join(' / ');
    return `Cabecera en la fila ${m.headerRow + 1}: ${[name(m.date), name(m.concept), importe].join(', ')}`;
  });

  protected readonly filasCabecera = computed(() => Array.from({ length: Math.min(this.facade.rowCount(), 40) }, (_, i) => i));

  protected readonly todasMarcadas = computed(() => {
    const rows = (this.facade.preview()?.rows ?? []).filter((r) => r.status !== 'invalid');
    return rows.length > 0 && rows.every((r) => this.facade.selected().has(r.line));
  });

  protected readonly totalSeleccion = computed(() =>
    this.facade.selectedRows().reduce((acc, r) => acc + (r.signedCents ?? 0), 0),
  );

  protected readonly botonImportar = computed(() => {
    const n = this.facade.selectedRows().length;
    if (this.facade.busy()) return 'Importando…';
    return n === 1 ? 'Importar 1 movimiento' : `Importar ${n} movimientos`;
  });

  protected estado(status: ImportRowStatus): string {
    return STATUS_LABEL[status];
  }

  protected fecha(date: IsoDate | null): string {
    return date ? formatDate(date) : '—';
  }

  protected importe(cents: number | null): string {
    return cents === null ? '—' : formatMoney(cents as Money, { sign: 'always' });
  }

  protected detalle(row: ImportRow): string {
    if (row.error) return row.error;
    if (row.matchedConcept) return `Coincide con «${row.matchedConcept}»`;
    return '';
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.facade.loadFile(file);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.facade.loadFile(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando.set(true);
  }

  protected setColumna(key: ColumnField, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const col = value === '' ? null : Number(value);
    // Importe con signo y cargo/abono se excluyen: o una cosa o la otra.
    const patch: Partial<ColumnMapping> =
      key === 'amount' && col !== null
        ? { amount: col, debit: null, credit: null }
        : (key === 'debit' || key === 'credit') && col !== null
          ? { [key]: col, amount: null }
          : { [key]: col };
    void this.facade.setMapping(patch);
  }

  protected setCabecera(event: Event): void {
    void this.facade.setMapping({ headerRow: Number((event.target as HTMLSelectElement).value) });
  }

  protected setCategoria(kind: 'expense' | 'income', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (kind === 'expense') this.facade.expenseCategoryId.set(value);
    else this.facade.incomeCategoryId.set(value);
  }

  protected toggleTodas(event: Event): void {
    this.facade.setAll((event.target as HTMLInputElement).checked);
  }

  protected otroFichero(): void {
    this.facade.reset();
    this.editarColumnas.set(false);
  }
}
