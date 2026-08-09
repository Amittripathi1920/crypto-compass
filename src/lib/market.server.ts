import type { Candle } from "./indicators";
import type { Timeframe } from "./coins";

type Ticker = {
  price: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

const num = (v: unknown) => Number(v);

/* ---------------- OKX ---------------- */
const OKX_BAR: Record<Timeframe, string> = { "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" };

async function okxCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const json = (await getJson(
    `https://www.okx.com/api/v5/market/candles?instId=${symbol}-USDT&bar=${OKX_BAR[tf]}&limit=300`,
  )) as { data?: string[][] };
  const rows = json.data ?? [];
  if (rows.length === 0) throw new Error("okx: empty candles");
  return rows
    .map((k) => ({
      time: num(k[0]),
      open: num(k[1]),
      high: num(k[2]),
      low: num(k[3]),
      close: num(k[4]),
      volume: num(k[5]),
    }))
    .reverse();
}

async function okxTicker(symbol: string): Promise<Ticker> {
  const json = (await getJson(
    `https://www.okx.com/api/v5/market/ticker?instId=${symbol}-USDT`,
  )) as { data?: Record<string, string>[] };
  const t = json.data?.[0];
  if (!t) throw new Error("okx: no ticker");
  const last = num(t['last']);
  const open = num(t['open24h']);
  return {
    price: last,
    change24hPct: open > 0 ? ((last - open) / open) * 100 : 0,
    high24h: num(t['high24h']),
    low24h: num(t['low24h']),
    quoteVolume24h: num(t['volCcy24h']),
  };
}

/* ---------------- Binance ---------------- */
const BINANCE_BASES = ["https://api.binance.com", "https://data-api.binance.vision"];

async function binance(path: string): Promise<unknown> {
  let last: unknown;
  for (const base of BINANCE_BASES) {
    try {
      return await getJson(`${base}${path}`);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("binance unavailable");
}

async function binanceCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const raw = (await binance(
    `/api/v3/klines?symbol=${symbol}USDT&interval=${tf}&limit=300`,
  )) as unknown[];
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("binance: empty candles");
  return raw.map((row) => {
    const k = row as string[];
    return {
      time: num(k[0]),
      open: num(k[1]),
      high: num(k[2]),
      low: num(k[3]),
      close: num(k[4]),
      volume: num(k[5]),
    };
  });
}

async function binanceTicker(symbol: string): Promise<Ticker> {
  const raw = (await binance(`/api/v3/ticker/24hr?symbol=${symbol}USDT`)) as Record<string, string>;
  return {
    price: num(raw['lastPrice']),
    change24hPct: num(raw['priceChangePercent']),
    high24h: num(raw['highPrice']),
    low24h: num(raw['lowPrice']),
    quoteVolume24h: num(raw['quoteVolume']),
  };
}

/* ---------------- Kraken ---------------- */
const KRAKEN_INTERVAL: Record<Timeframe, number> = { "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };
const krakenAsset = (s: string) => (s === "BTC" ? "XBT" : s === "DOGE" ? "XDG" : s);

async function krakenCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const json = (await getJson(
    `https://api.kraken.com/0/public/OHLC?pair=${krakenAsset(symbol)}USDT&interval=${KRAKEN_INTERVAL[tf]}`,
  )) as { error?: string[]; result?: Record<string, unknown> };
  if (json.error?.length) throw new Error(`kraken: ${json.error.join(", ")}`);
  const series = Object.entries(json.result ?? {}).find(([k]) => k !== "last")?.[1] as
    | string[][]
    | undefined;
  if (!series || series.length === 0) throw new Error("kraken: empty candles");
  return series.slice(-300).map((k) => ({
    time: num(k[0]) * 1000,
    open: num(k[1]),
    high: num(k[2]),
    low: num(k[3]),
    close: num(k[4]),
    volume: num(k[6]),
  }));
}

function tickerFromCandles(candles: Candle[]): Ticker {
  const last = candles[candles.length - 1]!;
  const spanMs = 24 * 60 * 60 * 1000;
  const cutoff = last.time - spanMs;
  const window = candles.filter((c) => c.time >= cutoff);
  const ref = window[0] ?? last;
  return {
    price: last.close,
    change24hPct: ref.open > 0 ? ((last.close - ref.open) / ref.open) * 100 : 0,
    high24h: Math.max(...window.map((c) => c.high)),
    low24h: Math.min(...window.map((c) => c.low)),
    quoteVolume24h: window.reduce((sum, c) => sum + c.volume * c.close, 0),
  };
}

async function firstOk<T>(label: string, tasks: Array<() => Promise<T>>): Promise<T> {
  const errors: string[] = [];
  for (const task of tasks) {
    try {
      return await task();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  console.error(`[market] ${label} failed:`, errors.join(" | "));
  throw new Error(`Market data unavailable for ${label} (${errors[0] ?? "unknown error"})`);
}

export async function fetchCandles(symbol: string, interval: Timeframe): Promise<Candle[]> {
  return firstOk(`${symbol} ${interval} candles`, [
    () => okxCandles(symbol, interval),
    () => binanceCandles(symbol, interval),
    () => krakenCandles(symbol, interval),
  ]);
}

export async function fetchTicker(symbol: string): Promise<Ticker> {
  return firstOk(`${symbol} ticker`, [
    () => okxTicker(symbol),
    () => binanceTicker(symbol),
    async () => tickerFromCandles(await krakenCandles(symbol, "1h")),
  ]);
}
