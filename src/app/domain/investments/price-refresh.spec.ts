import type { Investment } from '../../core/types/investment';
import { isoDate } from '../../core/types/iso-date';
import {
  isAutoRefreshDue,
  isIsin,
  pricePlanOf,
  priceTargets,
  valueFromPrice,
} from './price-refresh';

const inv = (over: Partial<Investment> = {}): Investment => ({
  id: 'a',
  name: 'MSCI World',
  issuer: null,
  assetClass: 'etf',
  ticker: 'IWDA.AS',
  units: 10,
  color: '#38BDF8',
  archived: false,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('price-refresh', () => {
  it('reconoce ISIN y no confunde tickers', () => {
    expect(isIsin('IE00B4L5Y983')).toBe(true);
    expect(isIsin('ie00b4l5y983')).toBe(true);
    expect(isIsin('IWDA.AS')).toBe(false);
    expect(isIsin('BTC')).toBe(false);
  });

  it('elige CoinGecko para cripto y Yahoo para el resto', () => {
    const crypto = pricePlanOf(inv({ assetClass: 'crypto', ticker: ' BTC ' }));
    expect(crypto.ok && crypto.target.source).toBe('coingecko');
    expect(crypto.ok && crypto.target.symbol).toBe('BTC');
    const fund = pricePlanOf(inv({ assetClass: 'index_fund', ticker: 'IE00B03HD191' }));
    expect(fund.ok && fund.target.source).toBe('yahoo');
  });

  it('deja a mano pensiones, depósitos y lo que no tiene ticker o participaciones', () => {
    expect(pricePlanOf(inv({ assetClass: 'pension' }))).toEqual({
      ok: false,
      reason: 'manual_class',
    });
    expect(pricePlanOf(inv({ assetClass: 'deposit' }))).toEqual({
      ok: false,
      reason: 'manual_class',
    });
    expect(pricePlanOf(inv({ ticker: '  ' }))).toEqual({ ok: false, reason: 'no_ticker' });
    expect(pricePlanOf(inv({ units: null }))).toEqual({ ok: false, reason: 'no_units' });
    expect(pricePlanOf(inv({ units: 0 }))).toEqual({ ok: false, reason: 'no_units' });
  });

  it('ignora las archivadas', () => {
    expect(
      priceTargets([inv(), inv({ id: 'b', archived: true })]).map((t) => t.investment.id),
    ).toEqual(['a']);
  });

  it('valor = precio × participaciones en céntimos redondeados', () => {
    expect(valueFromPrice(98.765, 12.4532)).toBe(122994);
    expect(valueFromPrice(0.1, 3)).toBe(30);
  });

  it('la automática corre una vez al día y solo si hay algo que actualizar', () => {
    const today = isoDate(2026, 10, 28);
    expect(isAutoRefreshDue(null, today, 2)).toBe(true);
    expect(isAutoRefreshDue(isoDate(2026, 10, 27), today, 2)).toBe(true);
    expect(isAutoRefreshDue(today, today, 2)).toBe(false);
    expect(isAutoRefreshDue(null, today, 0)).toBe(false);
  });
});
