import { Injectable, computed, inject, signal } from '@angular/core';

import { type AppError, type ValidationError, describeError, messageOf } from '../core/errors/app-error';
import { activeCurrency, formatMoney } from '../core/format/money-format';
import { uuidV7 } from '../core/ids/uuid-v7';
import type { IsoDate } from '../core/types/iso-date';
import { type Money, money } from '../core/types/money';
import type { Account } from '../core/types/account';
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

/** Resumen de una importación terminada (tarjeta final y aviso con «Deshacer»). */
export interface ImportSummary {
  readonly batchId: string;
  readonly inserted: number;
  readonly incomeCents: Money;
  readonly outflowCents: Money;
  readonly from: IsoDate | null;
  readonly to: IsoDate | null;
  readonly ruled: number;
  readonly accountName: string | null;
  /** `true` cuando se ha deshecho desde el aviso o la tarjeta. */
  readonly undone: boolean;
}

/** Tiempo para «Deshacer» la importación desde el aviso. */
const UNDO_IMPORT_MS = 10_000;

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
  private readonly accountsSig = signal<readonly Account[]>([]);
  private readonly busySig = signal(false);
  private readonly errorSig = signal<string | null>(null);
  private readonly insertedSig = signal<number | null>(null);
  private readonly summarySig = signal<ImportSummary | null>(null);

  readonly expenseCategoryId = signal<string>(DEFAULT_IMPORT_CATEGORIES.expense);
  readonly incomeCategoryId = signal<string>(DEFAULT_IMPORT_CATEGORIES.income);
  /** Cuenta del extracto; por defecto «Cuenta principal» o, si no existe, la primera activa. */
  readonly accountId = signal<string | null>(null);

  readonly sheet = this.sheetSig.asReadonly();
  readonly mapping = this.mappingSig.asReadonly();
  readonly autoDetected = this.autoDetectedSig.asReadonly();
  readonly preview = this.previewSig.asReadonly();
  readonly selected = this.selectedSig.asReadonly();
  readonly busy = this.busySig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly inserted = this.insertedSig.asReadonly();
  readonly summary = this.summarySig.asReadonly();

  readonly step = computed<ImportStep>(() => (this.insertedSig() !== null ? 'done' : this.sheetSig() ? 'review' : 'file'));
  readonly mappingComplete = computed(() => isMappingComplete(this.mappingSig()));
  readonly columns = computed(() => {
    const sheet = this.sheetSig();
    return sheet ? columnLabels(sheet.rows, this.mappingSig().headerRow) : [];
  });
  readonly rowCount = computed(() => this.sheetSig()?.rows.length ?? 0);

  readonly expenseCategories = computed(() => this.categoriesSig().filter((c) => c.kind !== 'income'));
  readonly accounts = computed(() => this.accountsSig().filter((a) => !a.archived));
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
    await this.loadLookups();
    await this.refreshPreview();
    this.busySig.set(false);
    const rows = sheet.value.rows.filter((r) => r.length > 0).length;
    if (detected) {
      const counts = this.previewSig()?.counts;
      const nuevos = counts ? ` · ${counts.new} nuevos` : '';
      this.status.notify(`«${file.name}» leído y enlazado: columnas reconocidas${nuevos}.`, 'income');
    } else {
      this.status.notify(`«${file.name}» leído (${rows} filas). Indica qué columna es cada cosa.`);
    }
  }

  async setMapping(patch: Partial<ColumnMapping>): Promise<void> {
    const wasComplete = this.mappingComplete();
    this.mappingSig.update((m) => ({ ...m, ...patch }));
    await this.refreshPreview();
    if (!wasComplete && this.mappingComplete() && this.previewSig()) {
      const n = this.previewSig()?.rows.filter((r) => r.status !== 'invalid').length ?? 0;
      this.status.notify(`Columnas enlazadas correctamente: ${n === 1 ? '1 fila válida' : `${n} filas válidas`}.`, 'income');
    }
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
    const batchId = uuidV7();
    const rows = this.selectedRows();
    const result = await new StatementImportService(repos.value).commit(rows, {
      fileName: sheet.fileName,
      accountId: this.accountId(),
      expenseCategoryId: this.expenseCategoryId(),
      incomeCategoryId: this.incomeCategoryId(),
      batchId,
    });
    this.busySig.set(false);
    if (!result.ok) {
      const e = result.error;
      const message = isValidationList(e) ? e.map((v) => v.message).join(' ') : describeError(e);
      this.errorSig.set(message);
      this.status.notify(`No se importó nada: ${message}`, 'expense');
      return;
    }
    const inserted = result.value.inserted;
    const summary = summarize(rows, batchId, inserted, this.accounts().find((a) => a.id === this.accountId())?.name ?? null);
    this.summarySig.set(summary);
    this.insertedSig.set(inserted);
    if (inserted === 0) return;
    this.status.touch();
    const where = summary.accountName ? ` en «${summary.accountName}»` : '';
    this.status.notify(
      `${inserted === 1 ? 'Se importó 1 movimiento' : `Se importaron ${inserted} movimientos`}${where}: ${formatMoney(summary.incomeCents, { sign: 'always' })} / ${formatMoney(money(-summary.outflowCents))}.`,
      'income',
      { durationMs: UNDO_IMPORT_MS, action: { label: 'Deshacer', run: () => void this.undo() } },
    );
  }

  /** Borra todo lo que entró con la última importación. */
  async undo(): Promise<void> {
    const summary = this.summarySig();
    if (!summary || summary.undone) return;
    const repos = this.db.require();
    if (!repos.ok) return;
    const deleted = await repos.value.events.deleteImportBatch(summary.batchId);
    if (!deleted.ok) {
      this.status.notify(describeError(deleted.error), 'expense');
      return;
    }
    this.summarySig.set({ ...summary, undone: true });
    this.status.touch();
    this.status.notify(
      deleted.value.deleted === 1 ? 'Importación deshecha: se quitó 1 movimiento.' : `Importación deshecha: se quitaron ${deleted.value.deleted} movimientos.`,
    );
  }

  reset(): void {
    this.sheetSig.set(null);
    this.mappingSig.set(EMPTY_MAPPING);
    this.autoDetectedSig.set(false);
    this.previewSig.set(null);
    this.selectedSig.set(new Set());
    this.errorSig.set(null);
    this.insertedSig.set(null);
    this.summarySig.set(null);
  }

  private async loadLookups(): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) return;
    const [categories, accounts] = await Promise.all([repos.value.categories.findAll(), repos.value.accounts.findAll()]);
    if (categories.ok) this.categoriesSig.set(categories.value);
    if (accounts.ok) {
      this.accountsSig.set(accounts.value);
      const current = this.accountId();
      const active = this.accounts();
      if (!active.some((a) => a.id === current)) this.accountId.set(defaultAccount(active)?.id ?? null);
    }
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

function summarize(rows: readonly ImportRow[], batchId: string, inserted: number, accountName: string | null): ImportSummary {
  let income = 0;
  let outflow = 0;
  let from: IsoDate | null = null;
  let to: IsoDate | null = null;
  let ruled = 0;
  for (const r of rows) {
    if (r.status === 'invalid' || r.signedCents === null || !r.date) continue;
    if (r.signedCents > 0) income += r.signedCents;
    else outflow -= r.signedCents;
    if (!from || r.date < from) from = r.date;
    if (!to || r.date > to) to = r.date;
    if (r.categoryId) ruled++;
  }
  return { batchId, inserted, incomeCents: money(income), outflowCents: money(outflow), from, to, ruled, accountName, undone: false };
}

function firstNonEmptyRow(sheet: StatementSheet): number {
  const i = sheet.rows.findIndex((r) => r.length > 0);
  return i < 0 ? 0 : i;
}

function isValidationList(e: AppError | readonly ValidationError[]): e is readonly ValidationError[] {
  return Array.isArray(e);
}

const MAIN_ACCOUNT_NAMES = ['cuenta principal', 'main account'];

function defaultAccount(accounts: readonly Account[]): Account | null {
  return accounts.find((a) => MAIN_ACCOUNT_NAMES.includes(a.name.trim().toLocaleLowerCase('es'))) ?? accounts[0] ?? null;
}
