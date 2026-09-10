import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { type AppError, describeError, notReady, validationError } from '../core/errors/app-error';
import type { DateFormat } from '../core/format/date-format';
import type { Currency } from '../core/format/money-format';
import {
  BASE_BUDGET_SCOPES,
  BUDGET_SCOPE_HINT,
  BUDGET_SCOPE_LABEL,
  type Budget,
  type BudgetKind,
  type BudgetScope,
  budgetKindOf,
  categoryScope,
  isCategoryBudgetable,
} from '../core/types/budget';
import type { Category, CategoryDraft, CategoryPatch } from '../core/types/category';
import { type IsoDate, addMonthsClamped, endOfMonth, nowIsoTimestamp, startOfMonth, todayIso } from '../core/types/iso-date';
import { type Money, money, ratioBasisPoints } from '../core/types/money';
import type { Recurrence, RecurrenceDraft, RecurrencePatch } from '../core/types/recurrence';
import { type Result, err, ok } from '../core/types/result';
import { DEFAULT_SETTINGS, type Settings } from '../core/types/settings';
import { backupFileName, inspectBackup, vacuumInto } from '../data/db/backup';
import { DbConnection } from '../data/db/db-connection';
import { LATEST_SCHEMA_VERSION } from '../data/db/migrations';
import { TauriDatabase } from '../data/db/tauri-database';
import { budgetLabel } from '../domain/budget/budget.service';
import { pickBackupTarget, pickDatabaseFile, removeIfExists, replaceDatabaseFile } from '../infra/fs/backup';
import { isTauri, setDbLocation } from '../infra/fs/db-location';
import { OllamaClient } from '../infra/ollama/ollama.client';
import { PreferencesService } from '../infra/platform/preferences.service';
import { AppStatusFacade } from './app-status.facade';

/** Categoría con el número de movimientos que la usan (columna del handoff). */
export interface CategoryRow {
  readonly category: Category;
  readonly uses: number;
  readonly usesLabel: string;
}

export type OllamaProbe = 'unknown' | 'checking' | 'connected' | 'model_missing' | 'not_detected';

/** Un presupuesto con el nombre que se ve en pantalla. */
export interface BudgetRow {
  readonly budget: Budget;
  readonly label: string;
  readonly kind: BudgetKind;
}

/** Opción del selector de tipo de presupuesto. */
export interface BudgetScopeOption {
  readonly scope: BudgetScope;
  readonly label: string;
  readonly hint: string;
  readonly group: 'base' | 'category';
}

/** Meses hacia atrás con los que se calcula el ingreso medio del pie del presupuesto. */
const INCOME_MONTHS = 6;

/**
 * Estado de la pantalla de Ajustes: fichero de datos y sus operaciones,
 * Ollama, categorías, ingresos recurrentes, presupuesto y formato.
 *
 * La sección de Ollama tiene su propio cliente y no comparte estado con
 * `AiFacade`: aquí se prueba una configuración que todavía no está guardada,
 * mientras que la pantalla de IA refleja la que sí lo está.
 */
@Injectable({ providedIn: 'root' })
export class SettingsFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);
  private readonly prefs = inject(PreferencesService);
  private readonly ollama = new OllamaClient();

  private readonly categoriesSig = signal<readonly CategoryRow[]>([]);
  private readonly incomesSig = signal<readonly Recurrence[]>([]);
  private readonly averageIncomeSig = signal<Money>(money(0));
  private readonly loadingSig = signal(true);
  private readonly errorSig = signal<AppError | null>(null);
  private readonly busySig = signal<string>('');
  private readonly probeSig = signal<OllamaProbe>('unknown');
  private readonly latencySig = signal<number | null>(null);
  private readonly probeMessageSig = signal<string>('');
  private readonly modelsSig = signal<readonly string[]>([]);
  private readonly budgetsSig = signal<readonly Budget[]>([]);

  readonly settings = this.prefs.settings;
  readonly categories = this.categoriesSig.asReadonly();
  readonly incomes = this.incomesSig.asReadonly();
  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  /** Texto de la operación en curso («Creando copia…»); vacío si no hay ninguna. */
  readonly busy = this.busySig.asReadonly();
  readonly probe = this.probeSig.asReadonly();
  readonly latencyMs = this.latencySig.asReadonly();
  readonly probeMessage = this.probeMessageSig.asReadonly();
  readonly models = this.modelsSig.asReadonly();

  readonly dbInfo = this.status.dbInfo;
  readonly demo = this.status.demo;
  /** Fuera de la ventana de Tauri no hay fichero que copiar ni diálogos nativos. */
  readonly fileActionsEnabled = computed(() => isTauri() && !this.status.demo());

  readonly averageIncome = this.averageIncomeSig.asReadonly();

  /** Presupuestos con su nombre visible, en el orden en que se crearon. */
  readonly budgets = computed<readonly BudgetRow[]>(() => {
    const categories = new Map(this.categoriesSig().map((r) => [r.category.id, r.category]));
    return this.budgetsSig().map((budget) => ({
      budget,
      label: budgetLabel(budget.scope, categories),
      kind: budgetKindOf(budget.scope),
    }));
  });

  readonly totalBudget = computed(() => this.budgetsSig().find((b) => b.scope === 'total')?.amountCents ?? null);

  /** Ámbitos que todavía no tienen presupuesto, para el selector de «+ Añadir presupuesto». */
  readonly availableScopes = computed<readonly BudgetScopeOption[]>(() => {
    const used = new Set<string>(this.budgetsSig().map((b) => b.scope));
    const base = BASE_BUDGET_SCOPES.filter((scope) => !used.has(scope)).map(
      (scope): BudgetScopeOption => ({ scope, label: BUDGET_SCOPE_LABEL[scope], hint: BUDGET_SCOPE_HINT[scope], group: 'base' }),
    );
    const porCategoria = this.categoriesSig()
      .map((r) => r.category)
      .filter((c) => c.kind !== 'income' && isCategoryBudgetable(c.id) && !used.has(categoryScope(c.id)))
      .map((c): BudgetScopeOption => ({ scope: categoryScope(c.id), label: c.name, hint: 'Gastos de esta categoría', group: 'category' }));
    return [...base, ...porCategoria];
  });

  /** «…deja una tasa de ahorro del 31,6 %», o `null` si no hay límite de gasto total. */
  readonly targetSavingsRateBp = computed(() => {
    const income = this.averageIncomeSig();
    const budget = this.totalBudget();
    if (budget === null) return null;
    return ratioBasisPoints(money(income - budget), income);
  });

  readonly totalIncomes = computed(() =>
    money(this.incomesSig().reduce((sum, r) => sum + (r.active ? r.amountCents : 0), 0)),
  );

  constructor() {
    effect(() => {
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.load());
    });
  }

  // ── Fichero de datos ─────────────────────────────────────────────────

  /** Copia consistente con `VACUUM INTO`, sin cerrar la base de datos. */
  async createBackup(): Promise<Result<string | null>> {
    const handle = this.db.handle();
    if (!handle) return err(notReady());
    const target = await pickBackupTarget(backupFileName());
    if (!target.ok) return this.report(target);
    if (target.value === null) return ok(null);

    this.busySig.set('Creando la copia de seguridad…');
    try {
      const cleared = await removeIfExists(target.value);
      if (!cleared.ok) return this.report(cleared);
      const copied = await vacuumInto(handle, target.value);
      if (!copied.ok) return this.report(copied);
      const stamped = await this.write('lastBackupAt', nowIsoTimestamp());
      if (!stamped.ok) return this.report(stamped);
      this.status.notify('Copia de seguridad creada.', 'income');
      return ok(target.value);
    } finally {
      this.busySig.set('');
    }
  }

  /**
   * Restaura una copia sobre el fichero activo. Antes de tocar nada abre el
   * candidato en una segunda conexión y lo valida; si no es una base de datos
   * de Fintrack no se sustituye nada.
   */
  async restoreBackup(): Promise<Result<number | null>> {
    const handle = this.db.handle();
    if (!handle) return err(notReady());
    const source = await pickDatabaseFile('Elige la copia de seguridad');
    if (!source.ok) return this.report(source);
    if (source.value === null) return ok(null);
    if (source.value === handle.path) {
      return this.report(err(validationError('restore', 'Ese es el fichero que ya está en uso.')));
    }

    this.busySig.set('Comprobando la copia…');
    try {
      const candidate = await TauriDatabase.open(source.value);
      if (!candidate.ok) return this.report(candidate);
      const summary = await inspectBackup(candidate.value, LATEST_SCHEMA_VERSION);
      await candidate.value.close();
      if (!summary.ok) return this.report(summary);

      this.busySig.set('Restaurando…');
      const target = handle.path;
      await this.db.detach();
      const replaced = await replaceDatabaseFile(source.value, target);
      if (!replaced.ok) {
        await this.status.retry();
        return this.report(replaced);
      }
      await this.status.retry();
      this.status.notify(`Copia restaurada: ${summary.value.events} movimientos.`, 'income');
      return ok(summary.value.events);
    } finally {
      this.busySig.set('');
    }
  }

  /**
   * «Cambiar»: escribe una copia en la ruta elegida, apunta ahí el fichero
   * puntero y reabre. El fichero anterior se conserva.
   */
  async changeLocation(): Promise<Result<string | null>> {
    const handle = this.db.handle();
    if (!handle) return err(notReady());
    const target = await pickBackupTarget('fintrack.db');
    if (!target.ok) return this.report(target);
    if (target.value === null) return ok(null);
    if (target.value === handle.path) return ok(null);

    this.busySig.set('Moviendo el fichero de datos…');
    try {
      const cleared = await removeIfExists(target.value);
      if (!cleared.ok) return this.report(cleared);
      const copied = await vacuumInto(handle, target.value);
      if (!copied.ok) return this.report(copied);
      const pointed = await setDbLocation(target.value);
      if (!pointed.ok) return this.report(pointed);
      await this.db.detach();
      await this.status.retry();
      this.status.notify('Fichero de datos movido. El anterior sigue en su sitio.', 'income');
      return ok(target.value);
    } finally {
      this.busySig.set('');
    }
  }

  // ── Ollama ───────────────────────────────────────────────────────────

  /** «Probar conexión»: mide latencia y comprueba que el modelo está descargado. */
  async testConnection(endpoint = this.settings().ollamaEndpoint, model = this.settings().ollamaModel): Promise<void> {
    this.probeSig.set('checking');
    this.probeMessageSig.set('');
    const ping = await this.ollama.ping(endpoint);
    if (!ping.ok) {
      this.latencySig.set(null);
      this.modelsSig.set([]);
      this.probeSig.set('not_detected');
      this.probeMessageSig.set(describeError(ping.error));
      return;
    }
    this.latencySig.set(ping.value.latencyMs);
    const models = await this.ollama.listModels(endpoint);
    this.modelsSig.set(models.ok ? models.value : []);
    if (models.ok && !models.value.some((m) => m === model || m.startsWith(model))) {
      this.probeSig.set('model_missing');
      this.probeMessageSig.set(`El modelo «${model}» no está descargado. Ejecuta: ollama pull ${model}`);
      return;
    }
    this.probeSig.set('connected');
  }

  async setEndpoint(endpoint: string): Promise<Result<void>> {
    const clean = endpoint.trim();
    if (!clean) return this.report(err(validationError('endpoint', 'El endpoint no puede estar vacío.')));
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(clean.replace(/\/+$/, ''))) {
      return this.report(
        err(validationError('endpoint', 'Fintrack solo habla con Ollama en 127.0.0.1 o localhost, nunca con la red.')),
      );
    }
    return this.write('ollamaEndpoint', clean.replace(/\/+$/, ''));
  }

  async setModel(model: string): Promise<Result<void>> {
    return this.write('ollamaModel', model);
  }

  // ── Categorías ───────────────────────────────────────────────────────

  async createCategory(draft: CategoryDraft): Promise<Result<Category>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const created = await repos.value.categories.insert(draft);
    if (created.ok) this.status.touch();
    return this.report(created);
  }

  async updateCategory(id: string, patch: CategoryPatch): Promise<Result<Category>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const updated = await repos.value.categories.update(id, patch);
    if (updated.ok) this.status.touch();
    return this.report(updated);
  }

  /** Las de sistema no se borran; los movimientos de una borrada quedan sin categoría. */
  async deleteCategory(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const row = this.categoriesSig().find((c) => c.category.id === id);
    if (row?.category.isSystem) {
      return this.report(err(validationError('category', 'Las categorías del sistema no se pueden borrar.')));
    }
    const deleted = await repos.value.categories.delete(id);
    if (deleted.ok) {
      this.status.touch();
      this.status.notify('Categoría borrada. Sus movimientos quedan sin categoría.');
    }
    return this.report(deleted);
  }

  // ── Ingresos recurrentes ─────────────────────────────────────────────

  async createIncome(draft: RecurrenceDraft): Promise<Result<Recurrence>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const created = await repos.value.recurrences.insert(draft);
    if (created.ok) this.status.touch();
    return this.report(created);
  }

  async updateIncome(id: string, patch: RecurrencePatch): Promise<Result<Recurrence>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const updated = await repos.value.recurrences.update(id, patch);
    if (updated.ok) this.status.touch();
    return this.report(updated);
  }

  async deleteIncome(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const deleted = await repos.value.recurrences.delete(id);
    if (deleted.ok) this.status.touch();
    return this.report(deleted);
  }

  // ── Presupuestos ─────────────────────────────────────────────────────

  /** Crea el presupuesto de un ámbito o, si ya existe, cambia su importe. */
  async saveBudget(scope: BudgetScope, amount: Money): Promise<Result<Budget>> {
    const repos = this.db.require();
    if (!repos.ok) return this.report(repos);
    const saved = await repos.value.budgets.save(scope, amount);
    if (saved.ok) this.status.touch();
    return this.report(saved);
  }

  async deleteBudget(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return this.report(repos);
    const deleted = await repos.value.budgets.delete(id);
    if (deleted.ok) this.status.touch();
    return this.report(deleted);
  }

  // ── Moneda y formato ─────────────────────────────────────────────────

  async setDateFormat(format: DateFormat): Promise<Result<void>> {
    return this.write('dateFormat', format);
  }

  async setCurrency(currency: Currency): Promise<Result<void>> {
    return this.write('currency', currency);
  }

  // ── Interno ──────────────────────────────────────────────────────────

  private async write<K extends keyof Settings>(field: K, value: Settings[K]): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return this.report(repos);
    const written = await repos.value.settings.set(field, value);
    if (written.ok) {
      await this.prefs.reload();
      this.status.touch();
    }
    return this.report(written);
  }

  private async load(): Promise<void> {
    const repos = this.db.repos();
    if (!repos) return;
    this.loadingSig.set(true);
    this.errorSig.set(null);

    const [categories, counts, recurrences, budgets] = await Promise.all([
      repos.categories.findAll(),
      repos.events.countByCategory(),
      repos.recurrences.findAll(),
      repos.budgets.findAll(),
    ]);
    if (!categories.ok) return this.fail(categories.error);
    if (!counts.ok) return this.fail(counts.error);
    if (!recurrences.ok) return this.fail(recurrences.error);
    if (!budgets.ok) return this.fail(budgets.error);
    this.budgetsSig.set(budgets.value);

    const byId = counts.value;
    this.categoriesSig.set(
      categories.value.map((category) => {
        const uses = byId.get(category.id) ?? 0;
        return { category, uses, usesLabel: uses === 1 ? '1 movimiento' : `${uses} movimientos` };
      }),
    );
    this.incomesSig.set(recurrences.value.filter((r) => r.type === 'income'));
    await this.loadAverageIncome();
    this.loadingSig.set(false);
  }

  /** Ingreso medio de los últimos meses completos, para el pie del presupuesto. */
  private async loadAverageIncome(): Promise<void> {
    const repos = this.db.repos();
    if (!repos) return;
    const today: IsoDate = todayIso();
    const from = startOfMonth(addMonthsClamped(today, -INCOME_MONTHS, 1));
    const to = endOfMonth(addMonthsClamped(today, -1, 1));
    const events = await repos.events.findInRange({ from, to }, { types: ['income'] });
    if (!events.ok) return;
    const total = events.value.reduce((sum, e) => sum + e.amountCents, 0);
    this.averageIncomeSig.set(money(Math.round(total / INCOME_MONTHS)));
  }

  private fail(error: AppError): void {
    this.errorSig.set(error);
    this.loadingSig.set(false);
  }

  private report<T>(result: Result<T>): Result<T> {
    if (!result.ok) this.status.notify(describeError(result.error), 'expense');
    return result;
  }
}

export { DEFAULT_SETTINGS };
