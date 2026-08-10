import type { Timeframe } from "./coins";
import type { BacktestSettings, BacktestStats, BacktestTrade } from "./backtest";

export type BacktestResult = {
  symbol: string;
  timeframe: Timeframe;
  generatedAt: string;
  settings: BacktestSettings;
  dataSource: {
    candles: string;
    attempts: { exchange: string; ok: boolean; ms: number; error?: string }[];
  };
  range: { from: number; to: number; candles: number };
  stats: BacktestStats;
  trades: BacktestTrade[];
};
