import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { type AppError, type ValidationError, describeError, validationError } from '../core/errors/app-error';
import type {
  Account,
  AccountDraft,
  AccountPatch,
  Reconciliation,
  Transfer,
  TransferDraft,
  TransferPatch,
} from '../core/types/account';
import { type IsoDate, todayIso } from '../core/types/iso-date';
import { type Money, ZERO, sumMoney } from '../core/types/money';
import { type Result, err } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import { AccountService, type ReconciliationView } from '../domain/accounts/account.service';
import { AppStatusFacade } from './app-status.facade';

/** Una cuenta con su saldo de hoy y su última conciliación (tarjeta de la pantalla Cuentas). */
export interface AccountRow {
  readonly account: Account;
  readonly balance: Money;
  readonly lastReconciliation: Reconciliation | null;
}

export type FormResult<T> = Result<T, AppError | readonly ValidationError[]>;

/** Traspasos que se listan en «Traspasos recientes». */
const RECENT_TRANSFERS = 20;

/**
 * Estado de la pantalla Cuentas: saldos a día de hoy, traspasos recientes y
 * el panel de conciliación. Recarga con `dataVersion` como el resto de
 * pantallas, así que registrar un movimiento desde el formulario actualiza
 * los saldos sin acoplar facades.
 */
@Injectable({ providedIn: 'root' })
export class AccountsFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);

  private readonly accountsSig = signal<readonly Account[]>([]);
  private readonly balancesSig = signal<ReadonlyMap<string, Money>>(new Map());
  private readonly reconciliationsSig = signal<readonly Reconciliation[]>([]);
  private readonly transfersSig = signal<readonly Transfer[]>([]);
  private readonly unassignedSig = signal(0);
  private readonly loadingSig = signal(true);
  private readonly errorSig = signal<AppError | null>(null);

  private readonly reconcilingIdSig = signal<string | null>(null);
  private readonly reconcileDateSig = signal<IsoDate>(todayIso());
  private readonly viewSig = signal<ReconciliationView | null>(null);

  readonly accounts = this.accountsSig.asReadonly();
  readonly transfers = this.transfersSig.asReadonly();
  readonly unassignedEvents = this.unassignedSig.asReadonly();
  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly reconciliation = this.viewSig.asReadonly();
  readonly reconcilingId = this.reconcilingIdSig.asReadonly();
  readonly reconcileDate = this.reconcileDateSig.asReadonly();

  readonly activeAccounts = computed(() => this.accountsSig().filter((a) => !a.archived));
  readonly accountById = computed(() => new Map(this.accountsSig().map((a) => [a.id, a])));

  readonly rows = computed<readonly AccountRow[]>(() => {
    const balances = this.balancesSig();
    const lastByAccount = new Map<string, Reconciliation>();
    // Vienen de la más reciente a la más antigua: la primera de cada cuenta es la última.
    for (const r of this.reconciliationsSig()) if (!lastByAccount.has(r.accountId)) lastByAccount.set(r.accountId, r);
    return this.accountsSig().map((account) => ({
      account,
      balance: balances.get(account.id) ?? ZERO,
      lastReconciliation: lastByAccount.get(account.id) ?? null,
    }));
  });

  readonly activeRows = computed(() => this.rows().filter((r) => !r.account.archived));
  readonly archivedRows = computed(() => this.rows().filter((r) => r.account.archived));

  /** Suma de todas las cuentas, archivadas incluidas: su dinero sigue existiendo. */
  readonly total = computed(() => sumMoney(this.rows().map((r) => r.balance)));

  constructor() {
    effect(() => {
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.load());
    });
  }

  // ── cuentas ───────────────────────────────────────────────────────────

  async createAccount(draft: Omit<AccountDraft, 'sortOrder'>): Promise<FormResult<Account>> {
    return this.run((s) => s.create(draft), 'Cuenta creada.');
  }

  async updateAccount(current: Account, patch: AccountPatch): Promise<FormResult<Account>> {
    return this.run((s) => s.update(current, patch), 'Cambios guardados.');
  }

  async setArchived(current: Account, archived: boolean): Promise<FormResult<Account>> {
    return this.run((s) => s.update(current, { archived }), archived ? 'Cuenta archivada.' : 'Cuenta recuperada.');
  }

  async deleteAccount(id: string): Promise<FormResult<void>> {
    return this.run((s) => s.remove(id), 'Cuenta borrada.');
  }

  // ── traspasos ─────────────────────────────────────────────────────────

  async createTransfer(draft: TransferDraft): Promise<FormResult<Transfer>> {
    return this.run((s) => s.createTransfer(draft), 'Traspaso guardado.');
  }

  async updateTransfer(current: Transfer, patch: TransferPatch): Promise<FormResult<Transfer>> {
    return this.run((s) => s.updateTransfer(current, patch), 'Cambios guardados.');
  }

  async deleteTransfer(id: string): Promise<FormResult<void>> {
    return this.run((s) => s.removeTransfer(id), 'Traspaso borrado.');
  }

  // ── conciliación ──────────────────────────────────────────────────────

  async openReconciliation(accountId: string): Promise<void> {
    this.reconcilingIdSig.set(accountId);
    this.reconcileDateSig.set(todayIso());
    this.viewSig.set(null);
    await this.loadView();
  }

  closeReconciliation(): void {
    this.reconcilingIdSig.set(null);
    this.viewSig.set(null);
  }

  /** Cambiar la fecha del extracto recalcula el saldo y las líneas hasta ese día. */
  async setReconcileDate(date: IsoDate): Promise<void> {
    this.reconcileDateSig.set(date);
    await this.loadView();
  }

  async reconcile(statementBalanceCents: Money, adjust: boolean): Promise<FormResult<Reconciliation>> {
    const id = this.reconcilingIdSig();
    if (!id) return err([validationError('account', 'Elige una cuenta.')]);
    const date = this.reconcileDateSig();
    const message = adjust ? 'Cuenta conciliada.' : 'Conciliación anotada.';
    return this.run((s) => s.reconcile(id, date, statementBalanceCents, adjust), message);
  }

  async deleteReconciliation(id: string): Promise<FormResult<void>> {
    return this.run((s) => s.removeReconciliation(id), 'Conciliación borrada.');
  }

  // ── internos ──────────────────────────────────────────────────────────

  /**
   * Ejecuta un caso de uso: si sale bien avisa y recarga todo (`touch`); un
   * error de BD sale como aviso y los de validación vuelven al formulario.
   */
  private async run<T>(
    action: (service: AccountService) => Promise<Result<T, AppError | readonly ValidationError[]>>,
    success: string,
  ): Promise<FormResult<T>> {
    const repos = this.db.require();
    if (!repos.ok) {
      this.status.notify(describeError(repos.error), 'expense');
      return repos;
    }
    const result = await action(new AccountService(repos.value));
    if (result.ok) {
      this.status.touch();
      this.status.notify(success, 'income');
    } else if (!Array.isArray(result.error)) {
      this.status.notify(describeError(result.error as AppError), 'expense');
    }
    return result;
  }

  private async load(): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) {
      this.errorSig.set(repos.error);
      return;
    }
    const service = new AccountService(repos.value);
    const [accounts, balances, reconciliations, transfers, unassigned] = await Promise.all([
      repos.value.accounts.findAll(),
      service.balances(todayIso()),
      repos.value.reconciliations.findAll(),
      repos.value.transfers.findRecent(RECENT_TRANSFERS),
      repos.value.accounts.countUnassignedEvents(),
    ]);
    this.loadingSig.set(false);
    const failed = [accounts, balances, reconciliations, transfers, unassigned].find((r) => !r.ok);
    if (failed && !failed.ok) {
      this.errorSig.set(failed.error);
      return;
    }
    this.errorSig.set(null);
    if (accounts.ok) this.accountsSig.set(accounts.value);
    if (balances.ok) this.balancesSig.set(balances.value);
    if (reconciliations.ok) this.reconciliationsSig.set(reconciliations.value);
    if (transfers.ok) this.transfersSig.set(transfers.value);
    if (unassigned.ok) this.unassignedSig.set(unassigned.value);
    if (this.reconcilingIdSig()) await this.loadView();
  }

  private async loadView(): Promise<void> {
    const id = this.reconcilingIdSig();
    const repos = this.db.require();
    if (!id || !repos.ok) return;
    const view = await new AccountService(repos.value).reconciliationView(id, this.reconcileDateSig());
    if (!view.ok) {
      this.status.notify(describeError(view.error), 'expense');
      return;
    }
    // Si mientras tanto se cerró o se abrió otra cuenta, esta respuesta ya no vale.
    if (this.reconcilingIdSig() === id) this.viewSig.set(view.value);
  }
}
