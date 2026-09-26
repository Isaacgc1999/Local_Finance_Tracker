import { type AppError, type ValidationError, validationError } from '../../core/errors/app-error';
import {
  type Account,
  type AccountDraft,
  type AccountPatch,
  type Reconciliation,
  type Transfer,
  type TransferDraft,
  type TransferPatch,
  isAccountKind,
} from '../../core/types/account';
import { type Event, type EventType, balanceSign } from '../../core/types/event';
import { type DateRange, type IsoDate, addDays, isIsoDate } from '../../core/types/iso-date';
import { type Money, ZERO, money } from '../../core/types/money';
import { type Result, err, ok } from '../../core/types/result';
import type { Repositories } from '../../data/repositories';
import { type AccountFlows, EMPTY_FLOWS } from '../../data/repositories/accounts.repository';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
export const ACCOUNT_NAME_MAX = 60;

/**
 * Saldo de una cuenta al cierre de `asOf`: saldo de apertura + movimientos
 * (con el signo de `balanceSign`) + traspasos recibidos − enviados + ajustes
 * de conciliación. Antes de la fecha de apertura la cuenta no existe: 0.
 */
export function balanceFromFlows(account: Account, flows: AccountFlows, asOf: IsoDate): Money {
  if (asOf < account.openingDate) return ZERO;
  let total: number = account.openingBalanceCents;
  for (const [type, sum] of flows.eventsByType) total += balanceSign(type) * sum;
  total += flows.transfersIn - flows.transfersOut + flows.adjustments;
  return money(total);
}

export type LedgerEntryKind = 'event' | 'transfer_in' | 'transfer_out';

/** Una línea del extracto de una cuenta, con el saldo que queda tras ella. */
export interface LedgerEntry {
  readonly kind: LedgerEntryKind;
  readonly id: string;
  readonly date: IsoDate;
  readonly concept: string;
  /** Con signo: + entra en la cuenta, − sale. */
  readonly amountCents: Money;
  readonly balanceCents: Money;
  /** Solo en movimientos: para pintar el badge de tipo. */
  readonly eventType: EventType | null;
}

/**
 * Extracto con saldo corrido. Mezcla movimientos y traspasos por fecha y, a
 * igual fecha, por orden de alta, que es como los ve el usuario en su banco.
 */
export function buildLedger(
  accountId: string,
  startingBalance: Money,
  events: readonly Event[],
  transfers: readonly Transfer[],
  accountNames: ReadonlyMap<string, string>,
): LedgerEntry[] {
  type Raw = Omit<LedgerEntry, 'balanceCents'> & { readonly createdAt: string };
  const raw: Raw[] = [];
  for (const e of events) {
    raw.push({
      kind: 'event',
      id: e.id,
      date: e.date,
      concept: e.concept,
      amountCents: money(balanceSign(e.type) * e.amountCents),
      eventType: e.type,
      createdAt: e.createdAt,
    });
  }
  for (const t of transfers) {
    const incoming = t.toAccountId === accountId;
    const other = accountNames.get(incoming ? t.fromAccountId : t.toAccountId) ?? 'otra cuenta';
    raw.push({
      kind: incoming ? 'transfer_in' : 'transfer_out',
      id: t.id,
      date: t.date,
      concept: t.concept ?? (incoming ? `Traspaso desde ${other}` : `Traspaso a ${other}`),
      amountCents: money(incoming ? t.amountCents : -t.amountCents),
      eventType: null,
      createdAt: t.createdAt,
    });
  }
  raw.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  let balance: number = startingBalance;
  return raw.map(({ createdAt: _createdAt, ...entry }) => {
    balance += entry.amountCents;
    return { ...entry, balanceCents: money(balance) };
  });
}

export function validateAccountDraft(draft: AccountDraft): Result<AccountDraft, readonly ValidationError[]> {
  const errors: ValidationError[] = [];
  const name = draft.name.trim();
  if (!name) errors.push(validationError('name', 'El nombre es obligatorio.'));
  else if (name.length > ACCOUNT_NAME_MAX) errors.push(validationError('name', `Máximo ${ACCOUNT_NAME_MAX} caracteres.`));
  if (!isAccountKind(draft.kind)) errors.push(validationError('kind', 'Tipo de cuenta no válido.'));
  if (!HEX_COLOR.test(draft.color)) errors.push(validationError('color', 'Color no válido.'));
  if (!Number.isSafeInteger(draft.openingBalanceCents)) {
    errors.push(validationError('openingBalance', 'El saldo inicial tiene que ser un importe válido.'));
  }
  if (!isIsoDate(draft.openingDate)) errors.push(validationError('openingDate', 'Fecha no válida.'));
  return errors.length ? err(errors) : ok({ ...draft, name });
}

/**
 * Importe > 0, dos cuentas distintas que existan, y una fecha que no sea
 * anterior a la apertura de ninguna de las dos: si no, el traspaso contaría
 * en una cuenta y no en la otra.
 */
export function validateTransferDraft(
  draft: TransferDraft,
  accounts: ReadonlyMap<string, Account>,
): Result<TransferDraft, readonly ValidationError[]> {
  const errors: ValidationError[] = [];
  if (!Number.isSafeInteger(draft.amountCents) || draft.amountCents <= 0) {
    errors.push(validationError('amount', 'El importe tiene que ser mayor que cero.'));
  }
  const dateOk = isIsoDate(draft.date);
  if (!dateOk) errors.push(validationError('date', 'Fecha no válida.'));
  const from = accounts.get(draft.fromAccountId);
  const to = accounts.get(draft.toAccountId);
  if (!from) errors.push(validationError('from', 'Elige la cuenta de origen.'));
  if (!to) errors.push(validationError('to', 'Elige la cuenta de destino.'));
  if (from && to && from.id === to.id) errors.push(validationError('to', 'El origen y el destino tienen que ser distintos.'));
  if (dateOk) {
    const tooEarly = [from, to].find((a) => a && draft.date < a.openingDate);
    if (tooEarly) errors.push(validationError('date', `${tooEarly.name} se abrió después de esa fecha.`));
  }
  const concept = draft.concept?.trim() ? draft.concept.trim() : null;
  return errors.length ? err(errors) : ok({ ...draft, concept });
}

export interface ReconciliationView {
  readonly account: Account;
  readonly last: Reconciliation | null;
  /** Desde qué día se lista (el siguiente a la última conciliación, o la apertura). */
  readonly range: DateRange;
  /** Saldo antes de la primera línea del extracto. */
  readonly startingBalance: Money;
  readonly ledger: readonly LedgerEntry[];
  /** Saldo calculado al cierre de `range.to`. */
  readonly balance: Money;
  readonly history: readonly Reconciliation[];
}

/** Casos de uso de cuentas, traspasos y conciliaciones. Depende de los repositorios, no de Angular. */
export class AccountService {
  constructor(private readonly repos: Repositories) {}

  /** Saldo de cada cuenta (archivadas incluidas) al cierre de `asOf`. */
  async balances(asOf: IsoDate): Promise<Result<ReadonlyMap<string, Money>>> {
    const [accounts, flows] = await Promise.all([this.repos.accounts.findAll(), this.repos.accounts.flowsUpTo(asOf)]);
    if (!accounts.ok) return accounts;
    if (!flows.ok) return flows;
    return ok(new Map(accounts.value.map((a) => [a.id, balanceFromFlows(a, flows.value.get(a.id) ?? EMPTY_FLOWS, asOf)])));
  }

  async balanceOf(account: Account, asOf: IsoDate): Promise<Result<Money>> {
    const flows = await this.repos.accounts.flowsUpTo(asOf);
    if (!flows.ok) return flows;
    return ok(balanceFromFlows(account, flows.value.get(account.id) ?? EMPTY_FLOWS, asOf));
  }

  async create(draft: Omit<AccountDraft, 'sortOrder'>): Promise<Result<Account, AppError | readonly ValidationError[]>> {
    const next = await this.repos.accounts.nextSortOrder();
    if (!next.ok) return next;
    const valid = validateAccountDraft({ ...draft, sortOrder: next.value });
    if (!valid.ok) return valid;
    return this.withNameCheck(await this.repos.accounts.insert(valid.value));
  }

  async update(current: Account, patch: AccountPatch): Promise<Result<Account, AppError | readonly ValidationError[]>> {
    const valid = validateAccountDraft({ ...current, ...patch });
    if (!valid.ok) return valid;
    const clean = 'name' in patch ? { ...patch, name: valid.value.name } : patch;
    return this.withNameCheck(await this.repos.accounts.update(current.id, clean));
  }

  /** Solo se borra una cuenta vacía; con movimientos o traspasos hay que archivarla. */
  async remove(id: string): Promise<Result<void>> {
    const uses = await this.repos.accounts.countUses(id);
    if (!uses.ok) return uses;
    if (uses.value > 0) {
      return err(validationError('account', 'La cuenta tiene movimientos o traspasos. Archívala para ocultarla sin perder su historia.'));
    }
    return this.repos.accounts.delete(id);
  }

  async createTransfer(draft: TransferDraft): Promise<Result<Transfer, AppError | readonly ValidationError[]>> {
    const accounts = await this.accountMap();
    if (!accounts.ok) return accounts;
    const valid = validateTransferDraft(draft, accounts.value);
    if (!valid.ok) return valid;
    return this.repos.transfers.insert(valid.value);
  }

  async updateTransfer(current: Transfer, patch: TransferPatch): Promise<Result<Transfer, AppError | readonly ValidationError[]>> {
    const accounts = await this.accountMap();
    if (!accounts.ok) return accounts;
    const valid = validateTransferDraft({ ...current, ...patch }, accounts.value);
    if (!valid.ok) return valid;
    const { fromAccountId, toAccountId, amountCents, date, concept } = valid.value;
    return this.repos.transfers.update(current.id, { fromAccountId, toAccountId, amountCents, date, concept });
  }

  removeTransfer(id: string): Promise<Result<void>> {
    return this.repos.transfers.delete(id);
  }

  /** Lo que muestra el panel de conciliación: extracto desde la última conciliación y saldo calculado. */
  async reconciliationView(accountId: string, asOf: IsoDate): Promise<Result<ReconciliationView>> {
    const [account, history, accounts] = await Promise.all([
      this.repos.accounts.findById(accountId),
      this.repos.reconciliations.findByAccount(accountId),
      this.repos.accounts.findAll(),
    ]);
    if (!account.ok) return account;
    if (!account.value) return err({ kind: 'not_found', entity: 'la cuenta', id: accountId });
    if (!history.ok) return history;
    if (!accounts.ok) return accounts;
    const acc = account.value;
    const last = history.value[0] ?? null;

    let startingBalance: Money = acc.openingBalanceCents;
    if (last) {
      const at = await this.balanceOf(acc, last.date);
      if (!at.ok) return at;
      startingBalance = at.value;
    }
    const range: DateRange = { from: last ? addDays(last.date, 1) : acc.openingDate, to: asOf };
    const names = new Map(accounts.value.map((a) => [a.id, a.name]));

    let ledger: LedgerEntry[] = [];
    if (range.from <= range.to) {
      const [events, transfers] = await Promise.all([
        this.repos.events.findInRange(range, { accountIds: [accountId] }),
        this.repos.transfers.findForAccount(accountId, range),
      ]);
      if (!events.ok) return events;
      if (!transfers.ok) return transfers;
      ledger = buildLedger(accountId, startingBalance, events.value, transfers.value, names);
    }
    const balance = await this.balanceOf(acc, asOf);
    if (!balance.ok) return balance;
    return ok({ account: acc, last, range, startingBalance, ledger, balance: balance.value, history: history.value });
  }

  /**
   * Guarda el saldo del extracto en `date`. Con `adjust`, la diferencia con el
   * saldo calculado se guarda como ajuste y la cuenta pasa a cuadrar; sin él,
   * queda anotada pero el saldo no cambia.
   */
  async reconcile(
    accountId: string,
    date: IsoDate,
    statementBalanceCents: Money,
    adjust: boolean,
  ): Promise<Result<Reconciliation, AppError | readonly ValidationError[]>> {
    const [account, history] = await Promise.all([
      this.repos.accounts.findById(accountId),
      this.repos.reconciliations.findByAccount(accountId),
    ]);
    if (!account.ok) return account;
    if (!account.value) return err({ kind: 'not_found', entity: 'la cuenta', id: accountId });
    if (!history.ok) return history;

    const errors: ValidationError[] = [];
    if (!isIsoDate(date)) errors.push(validationError('date', 'Fecha no válida.'));
    else if (date < account.value.openingDate) errors.push(validationError('date', 'La fecha es anterior a la apertura de la cuenta.'));
    else if (history.value[0] && date < history.value[0].date) {
      errors.push(validationError('date', 'Ya hay una conciliación posterior a esa fecha.'));
    }
    if (!Number.isSafeInteger(statementBalanceCents)) errors.push(validationError('statement', 'Importe no válido.'));
    if (errors.length) return err(errors);

    const computed = await this.balanceOf(account.value, date);
    if (!computed.ok) return computed;
    const adjustmentCents = adjust ? money(statementBalanceCents - computed.value) : ZERO;
    return this.repos.reconciliations.insert({ accountId, date, statementBalanceCents, adjustmentCents });
  }

  removeReconciliation(id: string): Promise<Result<void>> {
    return this.repos.reconciliations.delete(id);
  }

  private async accountMap(): Promise<Result<ReadonlyMap<string, Account>>> {
    const all = await this.repos.accounts.findAll();
    if (!all.ok) return all;
    return ok(new Map(all.value.map((a) => [a.id, a])));
  }

  /** El índice único de nombre llega como error de BD; se traduce a un error de campo legible. */
  private withNameCheck(result: Result<Account>): Result<Account, AppError | readonly ValidationError[]> {
    if (!result.ok && result.error.kind === 'db' && /UNIQUE/i.test(result.error.message)) {
      return err([validationError('name', 'Ya hay una cuenta con ese nombre.')]);
    }
    return result;
  }
}
