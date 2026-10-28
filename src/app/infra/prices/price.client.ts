import type { AppError } from '../../core/errors/app-error';
import type { Currency } from '../../core/format/money-format';
import { type Result, err, ok } from '../../core/types/result';
import { isIsin } from '../../domain/investments/price-refresh';
import { isTauri } from '../fs/db-location';

/**
 * Precios de mercado para Inversiones. Dentro de Tauri usa `plugin-http`
 * (petición desde Rust, sin CORS, con el scope limitado en las capabilities
 * a CoinGecko y Yahoo); fuera, el `fetch` del navegador (en el modo demo
 * Yahoo no responde por CORS y el fallo se muestra como cualquier otro).
 *
 * Solo viaja el ticker, ISIN o par de divisas: nunca importes.
 */

const COINGECKO = 'https://api.coingecko.com/api/v3';
const YAHOO = 'https://query2.finance.yahoo.com';
const TIMEOUT_MS = 10_000;

/** Monedas que Yahoo da en céntimos (peniques, centavos de rand, agorot). */
const MINOR_UNITS: Readonly<Record<string, string>> = {
  GBp: 'GBP',
  GBX: 'GBP',
  ZAc: 'ZAR',
  ILA: 'ILS',
};

export interface Quote {
  /** Precio unitario ya en la moneda de la app. */
  readonly price: number;
  /** Símbolo con el que respondió la fuente («IWDA.AS», «bitcoin»). */
  readonly resolvedSymbol: string;
}

function pricesError(
  reason: Extract<AppError, { kind: 'prices' }>['reason'],
  message: string,
): AppError {
  return { kind: 'prices', reason, message };
}

async function httpGet(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    if (isTauri()) {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      // Sin Origin (lo añade el plugin y no hace falta de servidor a
      // servidor) y con un User-Agent de navegador: Yahoo rechaza peticiones
      // sin él.
      const headers = new Headers({
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Fintrack)',
      });
      headers.set('Origin', '');
      return await tauriFetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        connectTimeout: TIMEOUT_MS,
      });
    }
    return await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string, label: string): Promise<Result<unknown>> {
  try {
    const res = await httpGet(url);
    if (res.status === 404) return err(pricesError('not_found', `${label} no lo encuentra.`));
    if (res.status === 429)
      return err(pricesError('http', `${label} pide esperar un poco (demasiadas peticiones).`));
    if (!res.ok) return err(pricesError('http', `${label} respondió ${res.status}.`));
    return ok(await res.json());
  } catch {
    return err(pricesError('network', `No se pudo contactar con ${label} (sin conexión o no responde).`));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

// ---------------------------------------------------------------- CoinGecko

interface CoinHit {
  readonly id: string;
  readonly symbol: string;
  readonly rank: number;
}

/**
 * Id de CoinGecko para lo que escribió el usuario: si coincide con un id
 * («bitcoin») gana ese; si no, la moneda con ese símbolo («BTC») de mayor
 * capitalización, porque hay muchas imitaciones con el mismo símbolo.
 */
export function pickCoinId(body: unknown, query: string): string | null {
  if (!isRecord(body) || !Array.isArray(body['coins'])) return null;
  const q = query.trim().toLowerCase();
  const hits: CoinHit[] = body['coins'].flatMap((c: unknown) => {
    if (!isRecord(c) || typeof c['id'] !== 'string' || typeof c['symbol'] !== 'string') return [];
    const rank =
      typeof c['market_cap_rank'] === 'number' ? c['market_cap_rank'] : Number.MAX_SAFE_INTEGER;
    return [{ id: c['id'], symbol: c['symbol'].toLowerCase(), rank }];
  });
  const byId = hits.find((h) => h.id === q);
  if (byId) return byId.id;
  const bySymbol = hits.filter((h) => h.symbol === q).sort((a, b) => a.rank - b.rank)[0];
  return bySymbol?.id ?? null;
}

/** `{ "bitcoin": { "eur": 61234.5 } }` → precio. */
export function parseCoinPrice(body: unknown, id: string, currency: Currency): number | null {
  if (!isRecord(body)) return null;
  const entry = body[id];
  return isRecord(entry) ? positive(entry[currency.toLowerCase()]) : null;
}

// ------------------------------------------------------------------- Yahoo

export interface YahooPrice {
  readonly symbol: string;
  readonly price: number;
  readonly currency: string;
}

/** Último precio de `/v8/finance/chart/{símbolo}`. */
export function parseYahooChart(body: unknown): YahooPrice | null {
  if (!isRecord(body) || !isRecord(body['chart'])) return null;
  const result = body['chart']['result'];
  if (!Array.isArray(result) || !isRecord(result[0]) || !isRecord(result[0]['meta'])) return null;
  const meta = result[0]['meta'];
  const price = positive(meta['regularMarketPrice']);
  const currency = typeof meta['currency'] === 'string' ? meta['currency'] : null;
  const symbol = typeof meta['symbol'] === 'string' ? meta['symbol'] : null;
  return price !== null && currency && symbol ? { symbol, price, currency } : null;
}

/** Primer valor cotizado de `/v1/finance/search` (ISIN o nombre → símbolo). */
export function parseYahooSearch(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body['quotes'])) return null;
  for (const q of body['quotes']) {
    if (
      isRecord(q) &&
      typeof q['symbol'] === 'string' &&
      q['symbol'] &&
      q['isYahooFinance'] !== false
    )
      return q['symbol'];
  }
  return null;
}

/** Peniques → libras y similares: precio y moneda en unidades normales. */
export function normalizeMinorUnits(
  price: number,
  currency: string,
): { readonly price: number; readonly currency: string } {
  const major = MINOR_UNITS[currency];
  return major
    ? { price: price / 100, currency: major }
    : { price, currency: currency.toUpperCase() };
}

export class PriceClient {
  /** Tipos de cambio de esta tanda, para no pedir el mismo par dos veces. */
  private readonly fx = new Map<string, Promise<Result<number>>>();

  async crypto(symbol: string, currency: Currency): Promise<Result<Quote>> {
    const search = await getJson(
      `${COINGECKO}/search?query=${encodeURIComponent(symbol)}`,
      'CoinGecko',
    );
    if (!search.ok) return search;
    const id = pickCoinId(search.value, symbol);
    if (!id)
      return err(
        pricesError(
          'not_found',
          `CoinGecko no conoce «${symbol}». Prueba con el id de la moneda (p. ej. «bitcoin»).`,
        ),
      );
    const res = await getJson(
      `${COINGECKO}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${currency.toLowerCase()}`,
      'CoinGecko',
    );
    if (!res.ok) return res;
    const price = parseCoinPrice(res.value, id, currency);
    return price === null
      ? err(pricesError('invalid', `CoinGecko no devolvió precio para «${symbol}».`))
      : ok({ price, resolvedSymbol: id });
  }

  async market(symbol: string, currency: Currency): Promise<Result<Quote>> {
    const quote = await this.yahooQuote(symbol.toUpperCase());
    if (!quote.ok) return quote;
    const { price, currency: from } = normalizeMinorUnits(quote.value.price, quote.value.currency);
    if (from === currency) return ok({ price, resolvedSymbol: quote.value.symbol });
    const rate = await this.rate(from, currency);
    if (!rate.ok) return rate;
    return ok({ price: price * rate.value, resolvedSymbol: quote.value.symbol });
  }

  /** Por ISIN se busca primero el símbolo; por ticker se prueba directo y, si no existe, se busca. */
  private async yahooQuote(symbol: string): Promise<Result<YahooPrice>> {
    if (!isIsin(symbol)) {
      const direct = await this.yahooChart(symbol);
      if (direct.ok || direct.error.kind !== 'prices' || direct.error.reason !== 'not_found')
        return direct;
    }
    const search = await getJson(
      `${YAHOO}/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=5&newsCount=0`,
      'Yahoo Finance',
    );
    if (!search.ok) return search;
    const found = parseYahooSearch(search.value);
    if (!found) return err(pricesError('not_found', `Yahoo Finance no encuentra «${symbol}».`));
    return this.yahooChart(found);
  }

  private async yahooChart(symbol: string): Promise<Result<YahooPrice>> {
    const res = await getJson(
      `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
      'Yahoo Finance',
    );
    if (!res.ok)
      return res.error.kind === 'prices' && res.error.reason === 'not_found'
        ? err(pricesError('not_found', `Yahoo Finance no encuentra «${symbol}».`))
        : res;
    const parsed = parseYahooChart(res.value);
    return parsed
      ? ok(parsed)
      : err(pricesError('invalid', `Yahoo Finance no devolvió precio para «${symbol}».`));
  }

  private rate(from: string, to: Currency): Promise<Result<number>> {
    const key = `${from}${to}`;
    let pending = this.fx.get(key);
    if (!pending) {
      pending = this.yahooChart(`${key}=X`).then((r) =>
        r.ok
          ? ok(r.value.price)
          : err(pricesError('invalid', `No hay tipo de cambio ${from} → ${to}.`)),
      );
      this.fx.set(key, pending);
    }
    return pending;
  }
}
