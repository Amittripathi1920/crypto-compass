export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / Math.min(period, values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    prev = i === 0 ? prev : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function rsi(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(closes: number[]) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const line = closes.map((_, i) => (fast[i] ?? 0) - (slow[i] ?? 0));
  const signal = ema(line, 9);
  const macdLine = line[line.length - 1] ?? 0;
  const signalLine = signal[signal.length - 1] ?? 0;
  return { macd: macdLine, signal: signalLine, histogram: macdLine - signalLine };
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return sma(trs, period);
}

export function swingLevels(candles: Candle[], lookback = 40) {
  const slice = candles.slice(-lookback);
  const highs = slice.map((c) => c.high);
  const lows = slice.map((c) => c.low);
  return {
    swingHigh: highs.length ? Math.max(...highs) : 0,
    swingLow: lows.length ? Math.min(...lows) : 0,
  };
}

export function volumeTrend(candles: Candle[]) {
  const vols = candles.map((c) => c.volume);
  const recent = sma(vols, 10);
  const baseline = sma(vols.slice(0, -10), 30) || recent;
  const ratio = baseline === 0 ? 1 : recent / baseline;
  return {
    recentAvgVolume: recent,
    baselineAvgVolume: baseline,
    ratio,
    label: ratio > 1.25 ? "expanding" : ratio < 0.8 ? "contracting" : "steady",
  };
}

export type Indicators = ReturnType<typeof computeIndicators>;

export function computeIndicators(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1] ?? 0;
  const ema20arr = ema(closes, 20);
  const ema50arr = ema(closes, 50);
  const ema200arr = ema(closes, 200);
  const ema20 = ema20arr[ema20arr.length - 1] ?? last;
  const ema50 = ema50arr[ema50arr.length - 1] ?? last;
  const ema200 = ema200arr[ema200arr.length - 1] ?? last;
  const m = macd(closes);
  const a = atr(candles);
  const swings = swingLevels(candles);
  const vol = volumeTrend(candles);
  const r = rsi(closes);

  const prev = closes[closes.length - 2] ?? last;
  const changePct = prev === 0 ? 0 : ((last - prev) / prev) * 100;

  const trend =
    ema20 > ema50 && ema50 > ema200
      ? "strong uptrend"
      : ema20 < ema50 && ema50 < ema200
        ? "strong downtrend"
        : ema20 > ema50
          ? "short-term bullish"
          : "short-term bearish";

  const bullScore =
    (ema20 > ema50 ? 1 : 0) +
    (ema50 > ema200 ? 1 : 0) +
    (last > ema20 ? 1 : 0) +
    (m.histogram > 0 ? 1 : 0) +
    (r > 52 ? 1 : 0);

  return {
    price: last,
    changePct,
    rsi: r,
    macd: m,
    atr: a,
    atrPct: last === 0 ? 0 : (a / last) * 100,
    ema20,
    ema50,
    ema200,
    trend,
    bias: bullScore >= 3 ? "bullish" : "bearish",
    bullScore,
    ...swings,
    volume: vol,
  };
}

export function roundToTick(value: number, reference: number): number {
  const decimals = reference >= 1000 ? 2 : reference >= 10 ? 3 : reference >= 1 ? 4 : 6;
  return Number(value.toFixed(decimals));
}
