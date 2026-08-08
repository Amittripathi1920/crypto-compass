import type { Candle } from "./indicators";
import type { Timeframe } from "./coins";

const BASES = ["https://api.binance.com", "https://data-api.binance.vision"];

async function tryFetch(path: string): Promise<unknown> {
  let lastError: unknown = null;
  for (const base of BASES) {
    try {
      const res = await fetch(`${base}${path}`, { headers: { accept: "application/json" } });
      if (!res.ok) {
        lastError = new Error(`Market data request failed (${res.status})`);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Market data unavailable");
}

export async function fetchCandles(symbol: string, interval: Timeframe): Promise<Candle[]> {
  const raw = (await tryFetch(
    `/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=300`,
  )) as unknown[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`No market data available for ${symbol}`);
  }
  return raw.map((row) => {
    const k = row as [number, string, string, string, string, string];
    return {
      time: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    };
  });
}

export async function fetchTicker(symbol: string) {
  const raw = (await tryFetch(`/api/v3/ticker/24hr?symbol=${symbol}USDT`)) as Record<string, string>;
  return {
    price: Number(raw['lastPrice']),
    change24hPct: Number(raw['priceChangePercent']),
    high24h: Number(raw['highPrice']),
    low24h: Number(raw['lowPrice']),
    quoteVolume24h: Number(raw['quoteVolume']),
  };
}
