import type { Candle } from "./indicators";
import type { ProviderId, Timeframe } from "./coins";
import type { MarketRegime, EngineConfig } from "./engine/types";
import type { ExchangeId, ExchangeAttempt } from "./market.server";

export type SignalRequest = {
  symbol: string;
  timeframe: Timeframe;
  provider: ProviderId;
  model?: string | undefined;
  apiKey?: string | undefined;
  config?: Partial<EngineConfig> | undefined;
};

export type SignalResult = {
  symbol: string;
  timeframe: Timeframe;
  generatedAt: string;
  modelUsed: string;
  dataSource: {
    exchange: ExchangeId;
    candles: string;
    ticker: string;
    attempts: ExchangeAttempt[];
  };
  currentPrice: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  marketRegime: MarketRegime;
  sentiment?: { value: number; label: string } | null | undefined;
  direction: "LONG" | "SHORT" | "NO TRADE";
  confluenceScore: number;
  confidence: "High" | "Moderate" | "Low";
  directionalEdge: number;
  longScore: number;
  shortScore: number;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3?: number | undefined;
  riskReward: number;
  summary: string;
  reasoning: { label: string; detail: string }[];
  rejectionReasons: string[];
  invalidation: string;
  setupType?: string[] | undefined;
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
  // Legacy aliases
  setupScore?: number | undefined;
  entryScore?: number | undefined;
  finalScore?: number | undefined;
};
