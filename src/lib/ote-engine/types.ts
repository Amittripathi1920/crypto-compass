import type { Candle } from "../indicators";
import type { Timeframe, ProviderId } from "../coins";
import type { ExchangeId, ExchangeAttempt } from "../market.server";

export type OteSetupGrade = "A+" | "A" | "B" | "NO_SETUP";

export type OteSweepEvent = {
  levelType: "PDH" | "PDL" | "PWH" | "PWL" | "EQH" | "EQL" | "MAJOR_SWING";
  price: number;
  time: number;
  wickSize: number;
  wickRatio: number;
  rvol: number;
  recencyCandles: number;
};

export type OteDisplacement = {
  direction: "BULLISH" | "BEARISH";
  impulseCandles: number;
  displacementAtrRatio: number;
  rvol: number;
  mssPrice: number; // Break of local counter-structure
  mssTime: number;
  fvg: {
    topPrice: number;
    bottomPrice: number;
    midPrice: number;
    sizeRatioToAtr: number;
    isFresh: boolean;
  } | null;
  orderBlock: {
    topPrice: number;
    bottomPrice: number;
    rvol: number;
    isFresh: boolean;
  } | null;
  originSwingLow: number;
  originSwingHigh: number;
};

export type OteFibZone = {
  swingOrigin: number;
  swingExtreme: number;
  fib500: number; // Equilibrium
  fib618: number; // Golden pocket start
  fib705: number; // OTE sweet spot
  fib786: number; // Deep discount / premium limit
  currentPrice: number;
  inOteZone: boolean;
  inDiscountOrPremium: boolean; // Discount for Long, Premium for Short
};

export type OteEntryModel = {
  type: "MARKET_OTE" | "LIMIT_OTE_FVG" | "LIMIT_OTE_OB" | "BREAKOUT_TRIGGER";
  entryPrice: number;
  entryZone: {
    min: number;
    max: number;
  };
  triggerRule: string;
  expirationCandles: number;
};

export type OteStopLossModel = {
  stopLossPrice: number;
  anchorType: "PROTECTED_SWEEP_LOW" | "PROTECTED_SWEEP_HIGH" | "DISPLACEMENT_ORIGIN";
  stopDistance: number;
  stopDistancePct: number;
  stopDistanceAtr: number;
  invalidationStatement: string;
};

export type OteTargetsModel = {
  tp1: { price: number; label: string; rMultiple: number; pctGain: number };
  tp2: { price: number; label: string; rMultiple: number; pctGain: number };
  tp3: { price: number; label: string; rMultiple: number; pctGain: number };
  grossRR: number;
  netRR: number;
  isStructural: boolean;
};

export type OteSignal = {
  symbol: string;
  timeframe: Timeframe;
  generatedAt: string;
  direction: "LONG" | "SHORT" | "NO TRADE";
  setupGrade: OteSetupGrade;
  qualityScore: number; // 0 - 100
  htfBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  marketRegime: string;
  currentPrice: number;
  sweep: OteSweepEvent | null;
  displacement: OteDisplacement | null;
  fibZone: OteFibZone | null;
  entry: OteEntryModel;
  stopLoss: OteStopLossModel;
  targets: OteTargetsModel;
  reasons: string[];
  blockers: string[];
  warnings: string[];
  context: string[];
  summary: string;
  invalidation: string;
  indicators: {
    rsi: number;
    atr: number;
    volumeRatio: number;
    trend: string;
  };
  dataSource: {
    exchange: ExchangeId;
    attempts: ExchangeAttempt[];
  };
  candles: Candle[];
};

export type OteSignalRequest = {
  symbol: string;
  timeframe: Timeframe;
  provider: ProviderId;
  model?: string | undefined;
  apiKey?: string | undefined;
  minRR?: number | undefined;
  minGrade?: "B" | "A" | "A+" | undefined;
};
