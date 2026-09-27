import { Injectable, computed, inject, signal } from '@angular/core';

import { type AppError, type ValidationError, describeError, messageOf } from '../core/errors/app-error';
import { activeCurrency } from '../core/format/money-format';
import type { Category } from '../core/types/category';
import { DbConnection } from '../data/db/db-connection';
import {
  type ColumnMapping,
  EMPTY_MAPPING,
  columnLabels,
  detectColumns,
  isMappingComplete,
} from '../domain/import/statement-columns';
import { type StatementSheet, readStatementFile } from '../domain/import/statement-file';
import {
  DEFAULT_IMPORT_CATEGORIES,
  type ImportPreview,
  type ImportRow,
  StatementImportService,
  parseRows,
  selectedByDefault,
} from '../domain/import/statement-import';
import { AppStatusFacade } from './app-status.facade';

export type ImportStep = 'file' | 'review' | 'done';

/**
 * Importación de extractos: fichero → columnas (detectadas o a mano) →
 * vista previa con duplicados → guardado en bloque. Nada toca la base de
 * datos hasta `commit()`.
 */
@Injectable({ providedIn: 'root' })
export class ImportFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);

  private readonly sheetSig = signal<StatementSheet | null>(null);
  private readonly mappingSig = signal<ColumnMapping>(EMPTY_MAPPING);
  private readonly autoDetectedSig = signal(false);
  private readonly previewSig = signal<ImportPreview | null>(null);
  private readonly selectedSig = signal<ReadonlySet<number>>(new Set());
  private readonly categoriesSig = signal<readonly Category[]>([]);
  private readonly busySig = signal(false);
  private readonly errorSig = signal<string | null>(null);
  private readonly insertedSig = signal<number | null>(null);

  readonly expenseCategoryId = signal<string>(DEFAULT_IMPORT_CATEGORIES.expense);
  readonly incomeCategoryId = signal<string>(DEFAULT_IMPORT_CATEGORIES.income);

  readonly sheet = this.sheetSig.asReadonly();
  readonly mapping = this.mappingSig.asReadonly();
  readonly autoDetected = this.autoDetectedSig.asReadonly();
  readonly preview = this.previewSig.asReadonly();
  readonly selected = this.selectedSig.asReadonly();
  readonly busy = this.busySig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly inserted = this.insertedSig.asReadonly();

  readonly step = computed<ImportStep>(() => (this.insertedSig() !== null ? 'done' : this.sheetSig() ? 'review' : 'file'));
  readonly mappingComplete = computed(() => isMappingComplete(this.mappingSig()));
  readonly columns = computed(() => {
    const sheet = this.sheetSig();
    return sheet ? columnLabels(sheet.rows, this.mappingSig().headerRow) : [];
  });
  readonly rowCount = computed(() => this.sheetSig()?.rows.length ?? 0);

  readonly expenseCategories = computed(() => this.categoriesSig().filter((c) => c.kind !== 'income'));
  readonly incomeCategories = computed(() => this.categoriesSig().filter((c) => c.kind !== 'expense'));
  readonly categoryById = computed(() => new Map(this.categoriesSig().map((c) => [c.id, c])));

  /** Filas de la vista previa a las que una regla ya ha puesto categoría. */
  readonly ruledCount = computed(() => (this.previewSig()?.rows ?? []).filter((r) => r.status !== 'invalid' && r.categoryId !== null).length);

  readonly selectedRows = computed<readonly ImportRow[]>(() => {
    const selected = this.selectedSig();
    return (this.previewSig()?.rows ?? []).filter((r) => selected.has(r.line));
  });

  async loadFile(file: File): Promise<void> {
    this.reset();
    this.busySig.set(true);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (cause) {
      this.busySig.set(false);
      this.errorSig.set(`No se pudo leer el fichero: ${messageOf(cause)}`);
      return;
    }
    const sheet = await readStatementFile(file.name, bytes);
    if (!sheet.ok) {
      this.busySig.set(false);
      this.errorSig.set(describeError(sheet.error));
      return;
    }
    const detected = detectColumns(sheet.value.rows);
    this.sheetSig.set(sheet.value);
    this.mappingSig.set(detected ?? { ...EMPTY_MAPPING, headerRow: firstNonEmptyRow(sheet.value) });
    this.autoDetectedSig.set(detected !== null);
    await this.loadCategories();
    await this.refreshPreview();
    this.busySig.set(false);
  }

  async setMapping(patch: Partial<ColumnMapping>): Promise<void> {
    this.mappingSig.update((m) => ({ ...m, ...patch }));
    await this.refreshPreview();
  }

  toggle(line: number): void {
    this.selectedSig.update((s) => {
      const next = new Set(s);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  }

  /** Marca o desmarca de golpe todas las filas importables. */
  setAll(checked: boolean): void {
    const rows = this.previewSig()?.rows ?? [];
    this.selectedSig.set(checked ? new Set(rows.filter((r) => r.status !== 'invalid').map((r) => r.line)) : new Set());
  }

  async commit(): Promise<void> {
    const sheet = this.sheetSig();
    if (!sheet) return;
    const repos = this.db.require();
    if (!repos.ok) {
      this.errorSig.set(describeError(repos.error));
      return;
    }
    this.busySig.set(true);
    const result = await new StatementImportService(repos.value).commit(this.selectedRows(), {
      fileName: sheet.fileName,
      expenseCategoryId: this.expenseCategoryId(),
      incomeCategoryId: this.incomeCategoryId(),
    });
    this.busySig.set(false);
    if (!result.ok) {
      const e = result.error;
      this.errorSig.set(isValidationList(e) ? e.map((v) => v.message).join(' ') : describeError(e));
      return;
    }
    this.insertedSig.set(result.value.inserted);
    if (result.value.inserted > 0) this.status.touch();
  }

  reset(): void {
    this.sheetSig.set(null);
    this.mappingSig.set(EMPTY_MAPPING);
    this.autoDetectedSig.set(false);
    this.previewSig.set(null);
    this.selectedSig.set(new Set());
    this.errorSig.set(null);
    this.insertedSig.set(null);
  }

  private async loadCategories(): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) return;
    const categories = await repos.value.categories.findAll();
    if (categories.ok) this.categoriesSig.set(categories.value);
  }

  private async refreshPreview(): Promise<void> {
    const sheet = this.sheetSig();
    const mapping = this.mappingSig();
    if (!sheet || !isMappingComplete(mapping)) {
      this.previewSig.set(null);
      this.selectedSig.set(new Set());
      return;
    }
    const repos = this.db.require();
    if (!repos.ok) {
      this.errorSig.set(describeError(repos.error));
      return;
    }
    const parsed = parseRows(sheet.rows, mapping, activeCurrency());
    const preview = await new StatementImportService(repos.value).preview(parsed);
    if (!preview.ok) {
      this.errorSig.set(describeError(preview.error));
      return;
    }
    this.errorSig.set(null);
    this.previewSig.set(preview.value);
    this.selectedSig.set(new Set(preview.value.rows.filter(selectedByDefault).map((r) => r.line)));
  }
}

function firstNonEmptyRow(sheet: StatementSheet): number {
  const i = sheet.rows.findIndex((r) => r.length > 0);
  return i < 0 ? 0 : i;
}

function isValidationList(e: AppError | readonly ValidationError[]): e is readonly ValidationError[] {
  return Array.isArray(e);
}
