import type { Candle } from "./indicators";
import type { ProviderId, Timeframe } from "./coins";

export type SignalRequest = {
  symbol: string;
  timeframe: Timeframe;
  provider: ProviderId;
  model?: string | undefined;
  apiKey?: string | undefined;
};

export type SignalResult = {
  symbol: string;
  timeframe: Timeframe;
  generatedAt: string;
  modelUsed: string;
  currentPrice: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  direction: "LONG" | "SHORT" | "NO TRADE";
  confidence: number;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskReward: number;
  summary: string;
  reasoning: { label: string; detail: string }[];
  invalidation: string;
  indicators: {
    rsi: number;
    macd: number;
    macdSignal: number;
    macdHistogram: number;
    ema20: number;
    ema50: number;
    ema200: number;
    atr: number;
    atrPct: number;
    swingHigh: number;
    swingLow: number;
    trend: string;
    volumeLabel: string;
    volumeRatio: number;
  };
  candles: Candle[];
};
