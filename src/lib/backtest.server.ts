import { fetchCandles } from "./market.server";
import { runBacktest, DEFAULT_SETTINGS, type BacktestSettings } from "./backtest";
import type { Timeframe } from "./coins";
import type { BacktestResult } from "./backtest-types";

export async function generateBacktest(input: {
  symbol: string;
  timeframe: Timeframe;
  stopAtr?: number | undefined;
  target1Rr?: number | undefined;
  maxBarsHeld?: number | undefined;
}): Promise<BacktestResult> {
  const res = await fetchCandles(input.symbol, input.timeframe);
  const settings: BacktestSettings = {
    stopAtr: input.stopAtr ?? DEFAULT_SETTINGS.stopAtr,
    target1Rr: input.target1Rr ?? DEFAULT_SETTINGS.target1Rr,
    target2Rr: (input.target1Rr ?? DEFAULT_SETTINGS.target1Rr) * 1.6,
    maxBarsHeld: input.maxBarsHeld ?? DEFAULT_SETTINGS.maxBarsHeld,
  };
  const { trades, stats } = runBacktest(res.value, settings);
  const candles = res.value;
  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    generatedAt: new Date().toISOString(),
    settings,
    dataSource: { candles: res.source, attempts: res.attempts },
    range: {
      from: candles[0]?.time ?? 0,
      to: candles[candles.length - 1]?.time ?? 0,
      candles: candles.length,
    },
    stats,
    trades,
  };
}
