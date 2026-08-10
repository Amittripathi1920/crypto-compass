import { computeIndicators, roundToTick, type Candle } from "./indicators";

export type BacktestTrade = {
  index: number;
  time: number;
  direction: "LONG" | "SHORT";
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  exit: number;
  exitTime: number;
  barsHeld: number;
  outcome: "target" | "stop" | "timeout";
  r: number;
  pnlPct: number;
};

export type BacktestStats = {
  warmupBars: number;
  barsTested: number;
  signals: { long: number; short: number; noTrade: number };
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number;
  avgRR: number;
  avgWinR: number;
  avgLossR: number;
  expectancyR: number;
  totalR: number;
  profitFactor: number;
  maxDrawdownR: number;
  avgBarsHeld: number;
  longWinRate: number;
  shortWinRate: number;
  buyHoldPct: number;
  equityCurve: { time: number; r: number }[];
};

export type BacktestSettings = {
  stopAtr: number;
  target1Rr: number;
  target2Rr: number;
  maxBarsHeld: number;
};

export const DEFAULT_SETTINGS: BacktestSettings = {
  stopAtr: 1.5,
  target1Rr: 2,
  target2Rr: 3.2,
  maxBarsHeld: 30,
};

/**
 * Same directional rule the live signal uses: the bullScore built from
 * EMA stack, price vs EMA20, MACD histogram and RSI.
 */
export function ruleDirection(bullScore: number): "LONG" | "SHORT" | "NO TRADE" {
  if (bullScore >= 4) return "LONG";
  if (bullScore <= 1) return "SHORT";
  return "NO TRADE";
}

export function runBacktest(
  candles: Candle[],
  settings: BacktestSettings = DEFAULT_SETTINGS,
): { trades: BacktestTrade[]; stats: BacktestStats } {
  const warmup = Math.min(200, Math.max(60, Math.floor(candles.length * 0.35)));
  const trades: BacktestTrade[] = [];
  const signals = { long: 0, short: 0, noTrade: 0 };
  let barsTested = 0;
  let openUntil = -1;

  for (let i = warmup; i < candles.length - 2; i++) {
    barsTested++;
    const ind = computeIndicators(candles.slice(0, i + 1));
    const direction = ruleDirection(ind.bullScore);
    if (direction === "LONG") signals.long++;
    else if (direction === "SHORT") signals.short++;
    else signals.noTrade++;

    if (direction === "NO TRADE") continue;
    if (i <= openUntil) continue; // no overlapping positions

    const entryCandle = candles[i + 1];
    if (!entryCandle) break;
    const entry = entryCandle.open;
    const atrUnit = ind.atr > 0 ? ind.atr : entry * 0.01;
    const sign = direction === "LONG" ? 1 : -1;
    const risk = atrUnit * settings.stopAtr;
    if (risk <= 0) continue;
    const stopLoss = entry - sign * risk;
    const target1 = entry + sign * risk * settings.target1Rr;
    const target2 = entry + sign * risk * settings.target2Rr;

    let outcome: BacktestTrade["outcome"] = "timeout";
    let exit = entry;
    let exitIndex = i + 1;

    for (let j = i + 1; j < Math.min(candles.length, i + 1 + settings.maxBarsHeld); j++) {
      const c = candles[j]!;
      exitIndex = j;
      const hitStop = direction === "LONG" ? c.low <= stopLoss : c.high >= stopLoss;
      const hitTarget = direction === "LONG" ? c.high >= target1 : c.low <= target1;
      if (hitStop) {
        // Conservative: if both levels trade in the same bar, assume the stop first.
        outcome = "stop";
        exit = stopLoss;
        break;
      }
      if (hitTarget) {
        outcome = "target";
        exit = target1;
        break;
      }
      exit = c.close;
    }

    const rMultiple = (sign * (exit - entry)) / risk;
    openUntil = exitIndex;
    trades.push({
      index: i,
      time: entryCandle.time,
      direction,
      entry: roundToTick(entry, entry),
      stopLoss: roundToTick(stopLoss, entry),
      target1: roundToTick(target1, entry),
      target2: roundToTick(target2, entry),
      exit: roundToTick(exit, entry),
      exitTime: candles[exitIndex]?.time ?? entryCandle.time,
      barsHeld: exitIndex - i,
      outcome,
      r: Number(rMultiple.toFixed(2)),
      pnlPct: Number(((sign * (exit - entry)) / entry * 100).toFixed(2)),
    });
  }

  const wins = trades.filter((t) => t.r > 0.01);
  const losses = trades.filter((t) => t.r < -0.01);
  const breakEven = trades.length - wins.length - losses.length;
  const totalR = trades.reduce((s, t) => s + t.r, 0);
  const grossWin = wins.reduce((s, t) => s + t.r, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.r, 0));

  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  const equityCurve = trades.map((t) => {
    cum += t.r;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
    return { time: t.exitTime, r: Number(cum.toFixed(2)) };
  });

  const rate = (list: BacktestTrade[]) => {
    if (list.length === 0) return 0;
    return (list.filter((t) => t.r > 0.01).length / list.length) * 100;
  };

  const first = candles[warmup]?.close ?? 0;
  const last = candles[candles.length - 1]?.close ?? 0;

  const stats: BacktestStats = {
    warmupBars: warmup,
    barsTested,
    signals,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakEven,
    winRate: Number(rate(trades).toFixed(1)),
    avgRR: Number((trades.length ? totalR / trades.length : 0).toFixed(2)),
    avgWinR: Number((wins.length ? grossWin / wins.length : 0).toFixed(2)),
    avgLossR: Number((losses.length ? -grossLoss / losses.length : 0).toFixed(2)),
    expectancyR: Number((trades.length ? totalR / trades.length : 0).toFixed(2)),
    totalR: Number(totalR.toFixed(2)),
    profitFactor: Number((grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : grossWin / grossLoss).toFixed(2)),
    maxDrawdownR: Number(maxDd.toFixed(2)),
    avgBarsHeld: Number(
      (trades.length ? trades.reduce((s, t) => s + t.barsHeld, 0) / trades.length : 0).toFixed(1),
    ),
    longWinRate: Number(rate(trades.filter((t) => t.direction === "LONG")).toFixed(1)),
    shortWinRate: Number(rate(trades.filter((t) => t.direction === "SHORT")).toFixed(1)),
    buyHoldPct: Number((first > 0 ? ((last - first) / first) * 100 : 0).toFixed(2)),
    equityCurve,
  };

  return { trades, stats };
}
