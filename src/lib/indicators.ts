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

export function determineRegime(ind: {
  ema20: number;
  ema50: number;
  ema200: number;
  trend: string;
  volume: { label: string; ratio: number };
}): string {
  const volLabel = ind.volume.label;
  const isEmaStackBull = ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200;
  const isEmaStackBear = ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200;

  if (isEmaStackBull && volLabel === "expanding") {
    return "Trending Bullish";
  }
  if (isEmaStackBear && volLabel === "expanding") {
    return "Trending Bearish";
  }
  if (volLabel === "contracting" || ind.volume.ratio < 0.85) {
    return "Compressing Range";
  }
  if (ind.trend === "short-term bullish") {
    return "Bullish Bias (Range)";
  }
  if (ind.trend === "short-term bearish") {
    return "Bearish Bias (Range)";
  }
  return "Choppy Range";
}

export type ConfluenceResult = {
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  confluenceReason: string;
};

export function findSweetSpot(
  ind: {
    ema20: number;
    ema50: number;
    swingHigh: number;
    swingLow: number;
  },
  price: number,
  atr: number,
  isLong: boolean
): ConfluenceResult {
  const fib50 = ind.swingHigh - 0.5 * (ind.swingHigh - ind.swingLow);
  const fib618 = ind.swingHigh - 0.618 * (ind.swingHigh - ind.swingLow);

  let entry = price;
  let stopLoss = isLong ? price - 1.5 * atr : price + 1.5 * atr;
  let target1 = isLong ? price + 2.5 * atr : price - 2.5 * atr;
  let target2 = isLong ? price + 4.0 * atr : price - 4.0 * atr;
  let confluenceReason = "Single Level Pivot (No High Confluence)";

  if (isLong) {
    // We want to buy at support below current spot price
    const levels = [
      { name: "EMA20", val: ind.ema20 },
      { name: "EMA50", val: ind.ema50 },
      { name: "Fib 50%", val: fib50 },
      { name: "Fib 61.8%", val: fib618 },
      { name: "Swing Low Support", val: ind.swingLow },
    ].filter((l) => l.val > 0 && l.val < price);

    // Sort descending (highest support closest to current price first)
    levels.sort((a, b) => b.val - a.val);

    // Find the tightest cluster of 2 levels within 1.0% of each other
    let foundCluster = false;
    for (let i = 0; i < levels.length - 1; i++) {
      const topLevel = levels[i]!;
      const bottomLevel = levels[i + 1]!;
      if ((topLevel.val - bottomLevel.val) / topLevel.val <= 0.01) {
        // Confluence Zone Found!
        entry = topLevel.val;
        stopLoss = bottomLevel.val - 0.15 * atr;
        confluenceReason = `Confluence Sweet Spot [${topLevel.name} + ${bottomLevel.name}]`;
        foundCluster = true;
        break;
      }
    }

    // Default structural fallback if no cluster is found
    if (!foundCluster && levels.length > 0) {
      entry = levels[0]!.val; // Buy at the nearest major support
      stopLoss = entry - 1.5 * atr;
    }

    // Ensure stop-loss doesn't exceed 3.5% (to preserve R:R) and is at least 0.5%
    const maxStopDist = price * 0.035;
    const minStopDist = price * 0.005;
    const currentStopDist = price - stopLoss;
    if (currentStopDist > maxStopDist) {
      stopLoss = price - maxStopDist;
    } else if (currentStopDist < minStopDist) {
      stopLoss = price - minStopDist;
    }

    // High-probability take profits
    // Target 1: Local Swing High - 0.1 * ATR (guarantees exit before major resistance wicks)
    target1 = ind.swingHigh > price
      ? ind.swingHigh - 0.1 * atr
      : price + 2.0 * atr;

    // Target 2: Strict 3.0x Risk multiple from Entry
    const risk = entry - stopLoss;
    target2 = entry + 3.0 * risk;
  } else {
    // Short: We want to sell at resistance above current spot price
    const levels = [
      { name: "EMA20", val: ind.ema20 },
      { name: "EMA50", val: ind.ema50 },
      { name: "Fib 50%", val: fib50 },
      { name: "Fib 61.8%", val: fib618 },
      { name: "Swing High Resistance", val: ind.swingHigh },
    ].filter((l) => l.val > price);

    // Sort ascending (lowest resistance closest to current price first)
    levels.sort((a, b) => a.val - b.val);

    // Find the tightest cluster of 2 levels within 1.0% of each other
    let foundCluster = false;
    for (let i = 0; i < levels.length - 1; i++) {
      const bottomLevel = levels[i]!;
      const topLevel = levels[i + 1]!;
      if ((topLevel.val - bottomLevel.val) / bottomLevel.val <= 0.01) {
        // Confluence Zone Found!
        entry = bottomLevel.val;
        stopLoss = topLevel.val + 0.15 * atr;
        confluenceReason = `Confluence Sweet Spot [${bottomLevel.name} + ${topLevel.name}]`;
        foundCluster = true;
        break;
      }
    }

    // Default structural fallback if no cluster is found
    if (!foundCluster && levels.length > 0) {
      entry = levels[0]!.val; // Short at the nearest major resistance
      stopLoss = entry + 1.5 * atr;
    }

    // Ensure stop-loss boundaries
    const maxStopDist = price * 0.035;
    const minStopDist = price * 0.005;
    const currentStopDist = stopLoss - price;
    if (currentStopDist > maxStopDist) {
      stopLoss = price + maxStopDist;
    } else if (currentStopDist < minStopDist) {
      stopLoss = price + minStopDist;
    }

    // High-probability take profits
    // Target 1: Local Swing Low + 0.1 * ATR (guarantees exit before major support wicks)
    target1 = ind.swingLow > 0 && ind.swingLow < price
      ? ind.swingLow + 0.1 * atr
      : price - 2.0 * atr;

    // Target 2: Strict 3.0x Risk multiple
    const risk = stopLoss - entry;
    target2 = entry - 3.0 * risk;
  }

  return { entry, stopLoss, target1, target2, confluenceReason };
}

export function rsiSeries(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(50);
  if (closes.length <= period) return result;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  const firstVal = result[period]!;
  for (let i = 0; i < period; i++) {
    result[i] = firstVal;
  }

  return result;
}

