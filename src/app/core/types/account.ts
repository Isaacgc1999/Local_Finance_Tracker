import type { IsoDate } from './iso-date';
import type { Money } from './money';

export const ACCOUNT_KINDS = ['bank', 'cash', 'card', 'savings'] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export function isAccountKind(value: unknown): value is AccountKind {
  return typeof value === 'string' && (ACCOUNT_KINDS as readonly string[]).includes(value);
}

export const ACCOUNT_KIND_LABEL: Readonly<Record<AccountKind, string>> = {
  bank: 'Cuenta bancaria',
  cash: 'Efectivo',
  card: 'Tarjeta',
  savings: 'Ahorro',
};

/** Color propuesto al crear una cuenta de cada tipo (tokens semánticos del handoff). */
export const ACCOUNT_KIND_COLOR: Readonly<Record<AccountKind, string>> = {
  bank: '#6E56F8',
  cash: '#22C55E',
  card: '#38BDF8',
  savings: '#FBBF24',
};

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly color: string;
  /**
   * Saldo al empezar el día `openingDate`. Puede ser negativo (una tarjeta de
   * crédito con deuda). Los movimientos anteriores a esa fecha ya están
   * dentro de este saldo y no se vuelven a sumar.
   */
  readonly openingBalanceCents: Money;
  readonly openingDate: IsoDate;
  /** Archivada: no se ofrece en formularios, pero su historia sigue contando. */
  readonly archived: boolean;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AccountDraft = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;

export type AccountPatch = Partial<AccountDraft>;

/** Dinero movido entre dos cuentas propias. No es ingreso ni gasto. */
export interface Transfer {
  readonly id: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  /** Siempre positivo. */
  readonly amountCents: Money;
  readonly date: IsoDate;
  readonly concept: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TransferDraft = Omit<Transfer, 'id' | 'createdAt' | 'updatedAt'>;

export type TransferPatch = Partial<TransferDraft>;

/** Comprobación del saldo de una cuenta contra el extracto del banco en una fecha. */
export interface Reconciliation {
  readonly id: string;
  readonly accountId: string;
  readonly date: IsoDate;
  /** Saldo que dice el banco al cierre de `date`. */
  readonly statementBalanceCents: Money;
  /** Diferencia asumida para cuadrar (extracto − saldo calculado). 0 si cuadraba o no se ajustó. */
  readonly adjustmentCents: Money;
  readonly createdAt: string;
}

export type ReconciliationDraft = Omit<Reconciliation, 'id' | 'createdAt'>;
