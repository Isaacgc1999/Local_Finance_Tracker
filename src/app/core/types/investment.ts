import type { IsoDate } from './iso-date';
import type { Money } from './money';

export const HOLDING_CLASSES = ['index_fund', 'etf', 'stock', 'crypto', 'pension', 'deposit', 'other'] as const;

export type HoldingClass = (typeof HOLDING_CLASSES)[number];

export function isHoldingClass(value: unknown): value is HoldingClass {
  return typeof value === 'string' && (HOLDING_CLASSES as readonly string[]).includes(value);
}

export const HOLDING_CLASS_LABEL: Readonly<Record<HoldingClass, string>> = {
  index_fund: 'Fondo indexado',
  etf: 'ETF',
  stock: 'Acciones',
  crypto: 'Cripto',
  pension: 'Plan de pensiones',
  deposit: 'Depósito / Letras',
  other: 'Otra',
};

/** Una inversión del usuario (posición). */
export interface Investment {
  readonly id: string;
  readonly name: string;
  /** Gestora, empresa o plataforma detrás («Vanguard», «Apple», «MyInvestor»). */
  readonly issuer: string | null;
  readonly assetClass: HoldingClass;
  /** Ticker o ISIN: preparado para actualizar el precio con una fuente externa. */
  readonly ticker: string | null;
  /** Participaciones o unidades (opcional). */
  readonly units: number | null;
  readonly color: string;
  readonly archived: boolean;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type InvestmentDraft = Omit<Investment, 'id' | 'createdAt' | 'updatedAt'>;

export type InvestmentPatch = Partial<InvestmentDraft>;

/** Foto de una inversión en un día: cuánto vale y cuánto se ha aportado hasta entonces. */
export interface Valuation {
  readonly id: string;
  readonly investmentId: string;
  readonly date: IsoDate;
  readonly marketValueCents: Money;
  readonly investedCents: Money;
  readonly createdAt: string;
}

export type ValuationDraft = Omit<Valuation, 'id' | 'createdAt'>;
