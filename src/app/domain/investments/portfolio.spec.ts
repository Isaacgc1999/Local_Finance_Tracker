import type { Investment, Valuation } from '../../core/types/investment';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { buildPortfolio } from './portfolio';

const inv = (id: string, archived = false): Investment => ({
  id,
  name: id,
  issuer: null,
  assetClass: 'index_fund',
  ticker: null,
  units: null,
  color: '#38BDF8',
  archived,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
});

const val = (investmentId: string, date: string, market: number, invested: number): Valuation => ({
  id: `${investmentId}-${date}`,
  investmentId,
  date: date as never,
  marketValueCents: money(market),
  investedCents: money(invested),
  createdAt: '',
});

describe('buildPortfolio', () => {
  it('usa la última valoración de cada inversión y calcula rentabilidad y peso', () => {
    const p = buildPortfolio(
      [inv('msci'), inv('btc'), inv('vieja', true)],
      [val('msci', '2026-09-01', 900000, 800000), val('msci', '2026-10-01', 1000000, 800000), val('btc', '2026-10-15', 250000, 300000), val('vieja', '2026-10-01', 5, 5)],
    );
    expect(p.marketValue).toBe(1250000);
    expect(p.invested).toBe(1100000);
    expect(p.gain).toBe(150000);
    expect(p.holdings[0]?.investment.id).toBe('msci');
    expect(p.holdings[0]?.gainBp).toBe(2500);
    expect(p.holdings[0]?.weightBp).toBe(8000);
    expect(p.holdings[1]?.gain).toBe(-50000);
    expect(p.stalest?.investment.id).toBe('msci');
    expect(p.holdings[0]?.previous?.date).toBe(isoDate(2026, 9, 1));
  });
});
