import type { HoldingClass, Investment } from '../../core/types/investment';
import type { IsoDate } from '../../core/types/iso-date';
import { type Money, money } from '../../core/types/money';

/**
 * Qué inversiones pueden actualizar su valor con un precio de mercado y
 * cómo. Todo puro: la red vive en `infra/prices`.
 *
 * - Cripto → CoinGecko (símbolo «BTC» o id «bitcoin»).
 * - Fondos, ETF, acciones y «otra» → Yahoo Finance por ticker («VWCE.DE»)
 *   o ISIN («IE00B4L5Y983»). Es una API no oficial: puede fallar sin aviso.
 * - Planes de pensiones y depósitos no cotizan: siempre a mano.
 *
 * A la red solo sale el ticker o ISIN, nunca importes ni participaciones.
 */

export type PriceSource = 'coingecko' | 'yahoo';

export type PriceSkipReason = 'manual_class' | 'no_ticker' | 'no_units';

export const PRICE_SKIP_LABEL: Readonly<Record<PriceSkipReason, string>> = {
  manual_class: 'este tipo no cotiza; se actualiza a mano',
  no_ticker: 'falta el ticker o ISIN',
  no_units: 'faltan las participaciones',
};

export const PRICE_SOURCE_LABEL: Readonly<Record<PriceSource, string>> = {
  coingecko: 'CoinGecko',
  yahoo: 'Yahoo Finance (beta)',
};

/** Tipos que no tienen precio de mercado público. */
const MANUAL_CLASSES: ReadonlySet<HoldingClass> = new Set<HoldingClass>(['pension', 'deposit']);

export interface PriceTarget {
  readonly investment: Investment;
  readonly source: PriceSource;
  /** Lo que se pregunta a la fuente: ticker o ISIN tal cual, sin espacios. */
  readonly symbol: string;
  readonly units: number;
}

export type PricePlan =
  | { readonly ok: true; readonly target: PriceTarget }
  | { readonly ok: false; readonly reason: PriceSkipReason };

/** ISIN: dos letras de país, nueve alfanuméricos y un dígito de control. */
export function isIsin(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value.trim().toUpperCase());
}

export function pricePlanOf(investment: Investment): PricePlan {
  if (MANUAL_CLASSES.has(investment.assetClass)) return { ok: false, reason: 'manual_class' };
  const symbol = (investment.ticker ?? '').replace(/\s+/g, '');
  if (!symbol) return { ok: false, reason: 'no_ticker' };
  const units = investment.units;
  if (units === null || !Number.isFinite(units) || units <= 0)
    return { ok: false, reason: 'no_units' };
  const source: PriceSource = investment.assetClass === 'crypto' ? 'coingecko' : 'yahoo';
  return { ok: true, target: { investment, source, symbol, units } };
}

/** Inversiones activas que se pueden actualizar solas. */
export function priceTargets(investments: readonly Investment[]): readonly PriceTarget[] {
  return investments
    .filter((i) => !i.archived)
    .flatMap((i) => {
      const plan = pricePlanOf(i);
      return plan.ok ? [plan.target] : [];
    });
}

/** Valor de la posición en céntimos: precio unitario × participaciones, redondeado. */
export function valueFromPrice(price: number, units: number): Money {
  return money(Math.round(price * units * 100));
}

/** La actualización automática corre una vez al día, y solo si hay algo que actualizar. */
export function isAutoRefreshDue(
  lastRefreshedOn: IsoDate | null,
  today: IsoDate,
  targets: number,
): boolean {
  return targets > 0 && lastRefreshedOn !== today;
}
