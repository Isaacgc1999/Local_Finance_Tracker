import type { Investment, Valuation } from '../../core/types/investment';
import type { IsoDate } from '../../core/types/iso-date';
import { type Money, ZERO, money, ratioBasisPoints } from '../../core/types/money';

export interface Holding {
  readonly investment: Investment;
  /** Última valoración, o `null` si no tiene ninguna. */
  readonly latest: Valuation | null;
  /** La anterior a la última (para la variación desde la última actualización). */
  readonly previous: Valuation | null;
  readonly marketValue: Money;
  readonly invested: Money;
  readonly gain: Money;
  /** Rentabilidad sobre lo aportado en puntos básicos; `null` sin aportación. */
  readonly gainBp: number | null;
  /** Peso en la cartera en puntos básicos. */
  readonly weightBp: number | null;
  readonly lastUpdate: IsoDate | null;
}

export interface Portfolio {
  readonly holdings: readonly Holding[];
  readonly marketValue: Money;
  readonly invested: Money;
  readonly gain: Money;
  readonly gainBp: number | null;
  /** Inversión con la valoración más antigua (la que más pide actualizarse). */
  readonly stalest: Holding | null;
}

export function buildPortfolio(investments: readonly Investment[], valuations: readonly Valuation[]): Portfolio {
  const byInvestment = new Map<string, Valuation[]>();
  for (const v of valuations) {
    const list = byInvestment.get(v.investmentId);
    if (list) list.push(v);
    else byInvestment.set(v.investmentId, [v]);
  }
  const active = investments.filter((i) => !i.archived);
  const partial = active.map((investment) => {
    const list = (byInvestment.get(investment.id) ?? []).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const latest = list[list.length - 1] ?? null;
    const previous = list[list.length - 2] ?? null;
    const marketValue = latest?.marketValueCents ?? ZERO;
    const invested = latest?.investedCents ?? ZERO;
    return { investment, latest, previous, marketValue, invested, gain: money(marketValue - invested), gainBp: ratioBasisPoints(money(marketValue - invested), invested), lastUpdate: latest?.date ?? null };
  });
  const marketValue = money(partial.reduce((s, h) => s + h.marketValue, 0));
  const invested = money(partial.reduce((s, h) => s + h.invested, 0));
  const holdings: Holding[] = partial
    .map((h) => ({ ...h, weightBp: ratioBasisPoints(h.marketValue, marketValue) }))
    .sort((a, b) => b.marketValue - a.marketValue);
  const stalest = holdings.filter((h) => h.lastUpdate).sort((a, b) => ((a.lastUpdate ?? '') < (b.lastUpdate ?? '') ? -1 : (a.lastUpdate ?? '') > (b.lastUpdate ?? '') ? 1 : 0))[0] ?? null;
  return {
    holdings,
    marketValue,
    invested,
    gain: money(marketValue - invested),
    gainBp: ratioBasisPoints(money(marketValue - invested), invested),
    stalest,
  };
}
