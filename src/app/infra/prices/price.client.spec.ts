import {
  normalizeMinorUnits,
  parseCoinPrice,
  parseYahooChart,
  parseYahooSearch,
  pickCoinId,
} from './price.client';

describe('price.client parsers', () => {
  it('CoinGecko: id exacto gana; si no, el símbolo con más capitalización', () => {
    const body = {
      coins: [
        { id: 'bitcoin-fake', symbol: 'BTC', market_cap_rank: 4000 },
        { id: 'bitcoin', symbol: 'BTC', market_cap_rank: 1 },
        { id: 'wrapped-bitcoin', symbol: 'WBTC', market_cap_rank: 15 },
      ],
    };
    expect(pickCoinId(body, 'btc')).toBe('bitcoin');
    expect(pickCoinId(body, 'bitcoin-fake')).toBe('bitcoin-fake');
    expect(pickCoinId(body, 'doge')).toBeNull();
    expect(pickCoinId({ nope: 1 }, 'btc')).toBeNull();
  });

  it('CoinGecko: precio en la moneda pedida', () => {
    expect(parseCoinPrice({ bitcoin: { eur: 61234.5 } }, 'bitcoin', 'EUR')).toBe(61234.5);
    expect(parseCoinPrice({ bitcoin: { usd: 1 } }, 'bitcoin', 'EUR')).toBeNull();
    expect(parseCoinPrice({}, 'bitcoin', 'EUR')).toBeNull();
  });

  it('Yahoo chart: último precio, moneda y símbolo', () => {
    const body = {
      chart: {
        result: [{ meta: { symbol: 'VWCE.DE', currency: 'EUR', regularMarketPrice: 132.42 } }],
        error: null,
      },
    };
    expect(parseYahooChart(body)).toEqual({ symbol: 'VWCE.DE', currency: 'EUR', price: 132.42 });
    expect(parseYahooChart({ chart: { result: null, error: { code: 'Not Found' } } })).toBeNull();
    expect(
      parseYahooChart({
        chart: { result: [{ meta: { symbol: 'X', currency: 'EUR', regularMarketPrice: 0 } }] },
      }),
    ).toBeNull();
  });

  it('Yahoo search: primer símbolo cotizado', () => {
    expect(
      parseYahooSearch({
        quotes: [{ symbol: 'IWDA.AS', isYahooFinance: true }, { symbol: 'SWDA.L' }],
      }),
    ).toBe('IWDA.AS');
    expect(
      parseYahooSearch({ quotes: [{ symbol: 'X', isYahooFinance: false }, { symbol: 'IWDA.AS' }] }),
    ).toBe('IWDA.AS');
    expect(parseYahooSearch({ quotes: [] })).toBeNull();
  });

  it('peniques a libras', () => {
    expect(normalizeMinorUnits(8123, 'GBp')).toEqual({ price: 81.23, currency: 'GBP' });
    expect(normalizeMinorUnits(10, 'usd')).toEqual({ price: 10, currency: 'USD' });
  });
});
