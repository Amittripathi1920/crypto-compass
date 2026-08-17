import type { Candle } from "./indicators";
import type { Timeframe } from "./coins";
import type { NormalizedCandle } from "./engine/types";

export type Ticker = {
  price: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
};

export type ExchangeId = "OKX" | "Binance" | "Kraken";

export type ExchangeAttempt = {
  exchange: ExchangeId;
  ok: boolean;
  ms: number;
  error?: string;
};

export type Sourced<T> = {
  value: T;
  source: ExchangeId;
  attempts: ExchangeAttempt[];
};

export type MultiTimeframeMarketData = {
  candles: Record<Timeframe, Candle[]>;
  ticker: Ticker;
  source: ExchangeId;
  attempts: ExchangeAttempt[];
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

const num = (v: unknown) => Number(v);

/**
 * Normalizes candle stream: validates numbers, cleans NaNs, dedupes, sorts ascending by timestamp
 */
export function normalizeCandles(raw: Candle[], timeframe?: Timeframe): NormalizedCandle[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  // Filter valid numbers
  const valid: NormalizedCandle[] = [];
  for (const c of raw) {
    if (
      c &&
      Number.isFinite(c.time) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      Number.isFinite(c.volume) &&
      c.open > 0 &&
      c.high > 0 &&
      c.low > 0 &&
      c.close > 0 &&
      c.high >= c.low
    ) {
      valid.push({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: Math.max(0, c.volume),
      });
    }
  }

  // Sort ascending by timestamp
  valid.sort((a, b) => a.time - b.time);

  // Deduplicate timestamps (keep the latest)
  const deduped: NormalizedCandle[] = [];
  const seenTimes = new Set<number>();
  for (let i = valid.length - 1; i >= 0; i--) {
    const c = valid[i]!;
    if (!seenTimes.has(c.time)) {
      seenTimes.add(c.time);
      deduped.unshift(c);
    }
  }

  return deduped;
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
  const candles = raw.map((row) => {
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
  return normalizeCandles(candles, tf);
}

async function binanceTicker(symbol: string): Promise<Ticker> {
  const raw = (await binance(`/api/v3/ticker/24hr?symbol=${symbol}USDT`)) as Record<string, string>;
  return {
    price: num(raw["lastPrice"]),
    change24hPct: num(raw["priceChangePercent"]),
    high24h: num(raw["highPrice"]),
    low24h: num(raw["lowPrice"]),
    quoteVolume24h: num(raw["quoteVolume"]),
  };
}

/* ---------------- OKX ---------------- */
const OKX_BAR: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "8h": "8H",
  "1d": "1D",
  "1w": "1W",
};

async function okxCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const json = (await getJson(
    `https://www.okx.com/api/v5/market/candles?instId=${symbol}-USDT&bar=${OKX_BAR[tf]}&limit=300`,
  )) as { data?: string[][] };
  const rows = json.data ?? [];
  if (rows.length === 0) throw new Error("okx: empty candles");
  const candles = rows
    .map((k) => ({
      time: num(k[0]),
      open: num(k[1]),
      high: num(k[2]),
      low: num(k[3]),
      close: num(k[4]),
      volume: num(k[5]),
    }))
    .reverse();
  return normalizeCandles(candles, tf);
}

async function okxTicker(symbol: string): Promise<Ticker> {
  const json = (await getJson(
    `https://www.okx.com/api/v5/market/ticker?instId=${symbol}-USDT`,
  )) as { data?: Record<string, string>[] };
  const t = json.data?.[0];
  if (!t) throw new Error("okx: no ticker");
  const last = num(t["last"]);
  const open = num(t["open24h"]);
  return {
    price: last,
    change24hPct: open > 0 ? ((last - open) / open) * 100 : 0,
    high24h: num(t["high24h"]),
    low24h: num(t["low24h"]),
    quoteVolume24h: num(t["volCcy24h"]),
  };
}

/* ---------------- Kraken ---------------- */
const KRAKEN_INTERVAL: Record<Timeframe, number> = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "8h": 480,
  "1d": 1440,
  "1w": 10080,
};
const krakenAsset = (s: string) => (s === "BTC" ? "XBT" : s === "DOGE" ? "XDG" : s);

async function krakenCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const json = (await getJson(
    `https://api.kraken.com/0/public/OHLC?pair=${krakenAsset(symbol)}USDT&interval=${KRAKEN_INTERVAL[tf]}`,
  )) as { error?: string[]; result?: Record<string, unknown> };
  if (json.error?.length) throw new Error(`kraken: ${json.error.join(", ")}`);
  const series = Object.entries(json.result ?? {}).find(([k]) => k !== "last")?.[1] as
    string[][] | undefined;
  if (!series || series.length === 0) throw new Error("kraken: empty candles");
  const candles = series.slice(-300).map((k) => ({
    time: num(k[0]) * 1000,
    open: num(k[1]),
    high: num(k[2]),
    low: num(k[3]),
    close: num(k[4]),
    volume: num(k[6]),
  }));
  return normalizeCandles(candles, tf);
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

/**
 * Fetches all requested timeframes and ticker from ONE single exchange consistently.
 * If Binance succeeds, 100% of timeframes come from Binance.
 * If Binance fails, falls back to OKX for ALL timeframes.
 * If OKX fails, falls back to Kraken for ALL timeframes.
 */
export async function fetchConsistentMarketData(
  symbol: string,
  timeframes: Timeframe[] = ["1d", "4h", "1h", "15m", "5m"],
): Promise<MultiTimeframeMarketData> {
  const attempts: ExchangeAttempt[] = [];

  const exchanges: Array<{
    exchange: ExchangeId;
    fetchTf: (tf: Timeframe) => Promise<Candle[]>;
    fetchTick: () => Promise<Ticker>;
  }> = [
    {
      exchange: "Binance",
      fetchTf: (tf) => binanceCandles(symbol, tf),
      fetchTick: () => binanceTicker(symbol),
    },
    {
      exchange: "OKX",
      fetchTf: (tf) => okxCandles(symbol, tf),
      fetchTick: () => okxTicker(symbol),
    },
    {
      exchange: "Kraken",
      fetchTf: (tf) => krakenCandles(symbol, tf),
      fetchTick: async () => tickerFromCandles(await krakenCandles(symbol, "1h")),
    },
  ];

  for (const ex of exchanges) {
    const started = Date.now();
    try {
      // Fetch all timeframes and ticker concurrently on this single exchange
      const tfPromises = timeframes.map(async (tf) => {
        const c = await ex.fetchTf(tf);
        return { tf, candles: c };
      });
      const [tfResults, ticker] = await Promise.all([Promise.all(tfPromises), ex.fetchTick()]);

      const candleMap = {} as Record<Timeframe, Candle[]>;
      for (const res of tfResults) {
        candleMap[res.tf] = res.candles;
      }

      attempts.push({
        exchange: ex.exchange,
        ok: true,
        ms: Date.now() - started,
      });

      return {
        candles: candleMap,
        ticker,
        source: ex.exchange,
        attempts,
      };
    } catch (err) {
      attempts.push({
        exchange: ex.exchange,
        ok: false,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const detail = attempts
    .map((a) => `${a.exchange} (${a.ms}ms): ${a.error ?? "unknown error"}`)
    .join("\n");
  const error = new Error(
    `Market data unavailable for ${symbol} across all timeframes.\n${detail}`,
  );
  (error as Error & { attempts?: ExchangeAttempt[] }).attempts = attempts;
  throw error;
}

export async function fetchCandles(
  symbol: string,
  interval: Timeframe,
): Promise<Sourced<Candle[]>> {
  const attempts: ExchangeAttempt[] = [];
  const tasks: Array<{ exchange: ExchangeId; run: () => Promise<Candle[]> }> = [
    { exchange: "Binance", run: () => binanceCandles(symbol, interval) },
    { exchange: "OKX", run: () => okxCandles(symbol, interval) },
    { exchange: "Kraken", run: () => krakenCandles(symbol, interval) },
  ];

  for (const task of tasks) {
    const started = Date.now();
    try {
      const value = await task.run();
      attempts.push({ exchange: task.exchange, ok: true, ms: Date.now() - started });
      return { value, source: task.exchange, attempts };
    } catch (err) {
      attempts.push({
        exchange: task.exchange,
        ok: false,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const detail = attempts
    .map((a) => `${a.exchange} (${a.ms}ms): ${a.error ?? "unknown error"}`)
    .join("\n");
  const error = new Error(`Market data unavailable for ${symbol} ${interval}.\n${detail}`);
  (error as Error & { attempts?: ExchangeAttempt[] }).attempts = attempts;
  throw error;
}

export async function fetchTicker(symbol: string): Promise<Sourced<Ticker>> {
  const attempts: ExchangeAttempt[] = [];
  const tasks: Array<{ exchange: ExchangeId; run: () => Promise<Ticker> }> = [
    { exchange: "Binance", run: () => binanceTicker(symbol) },
    { exchange: "OKX", run: () => okxTicker(symbol) },
    { exchange: "Kraken", run: async () => tickerFromCandles(await krakenCandles(symbol, "1h")) },
  ];

  for (const task of tasks) {
    const started = Date.now();
    try {
      const value = await task.run();
      attempts.push({ exchange: task.exchange, ok: true, ms: Date.now() - started });
      return { value, source: task.exchange, attempts };
    } catch (err) {
      attempts.push({
        exchange: task.exchange,
        ok: false,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const detail = attempts
    .map((a) => `${a.exchange} (${a.ms}ms): ${a.error ?? "unknown error"}`)
    .join("\n");
  const error = new Error(`Ticker unavailable for ${symbol}.\n${detail}`);
  (error as Error & { attempts?: ExchangeAttempt[] }).attempts = attempts;
  throw error;
}

export type SentimentData = {
  value: number;
  sentiment: string;
};

export async function fetchFearAndGreed(): Promise<SentimentData | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { value: string; value_classification: string }[];
    };
    const first = json.data?.[0];
    if (!first) return null;
    return {
      value: Number(first.value),
      sentiment: first.value_classification,
    };
  } catch (err) {
    console.warn("[market] Failed to fetch Fear & Greed Index:", err);
    return null;
  }
}

export type GlobalMetrics = {
  btcDominance: number;
  ethDominance: number;
};

export async function fetchGlobalCryptoMetrics(): Promise<GlobalMetrics | null> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/global", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        market_cap_percentage?: {
          btc?: number;
          eth?: number;
        };
      };
    };
    const caps = json.data?.market_cap_percentage;
    if (!caps || typeof caps.btc !== "number") return null;
    return {
      btcDominance: caps.btc,
      ethDominance: caps.eth ?? 0,
    };
  } catch (err) {
    console.warn("[market] Failed to fetch Global Crypto Metrics:", err);
    return null;
  }
}
