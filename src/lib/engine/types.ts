import type { Candle } from "../indicators";

export type NormalizedCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number | undefined;
  isClosed?: boolean | undefined;
};

export type MarketRegime =
  | "STRONG_BULLISH"
  | "BULLISH"
  | "WEAK_BULLISH"
  | "RANGING"
  | "WEAK_BEARISH"
  | "BEARISH"
  | "STRONG_BEARISH"
  | "BREAKOUT"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY";

export type SwingPoint = {
  index: number;
  price: number;
  type: "high" | "low";
  time: number;
  strength: number;
  isExternal?: boolean | undefined;
};

export type BOS = {
  type: "BOS_BULL" | "BOS_BEAR";
  price: number;
  time: number;
  sourceSwingIndex: number;
  strength: number;
  isExternal?: boolean | undefined;
};

export type CHoCH = {
  type: "CHOCH_BULL" | "CHOCH_BEAR";
  price: number;
  time: number;
  sourceSwingIndex: number;
  strength: number;
  isExternal?: boolean | undefined;
};

export type MarketStructure = {
  swings: SwingPoint[];
  bos: BOS[];
  choch: CHoCH[];
  externalBos?: BOS[] | undefined;
  externalChoch?: CHoCH[] | undefined;
  internalBos?: BOS[] | undefined;
  internalChoch?: CHoCH[] | undefined;
};

export type LiquidityLevelType =
  "PDH" | "PDL" | "PWH" | "PWL" | "EQH" | "EQL" | "SWING_HIGH" | "SWING_LOW";

export type LiquidityLevel = {
  id: string;
  type: LiquidityLevelType;
  price: number;
  strength: number;
  isSwept: boolean;
  time: number;
  distancePct?: number | undefined;
  recencyCandles?: number | undefined;
  reactionQuality?: number | undefined;
};

export type LiquiditySweep = {
  direction: "BULLISH" | "BEARISH";
  sweptLevelPrice: number;
  sweptLevelType: LiquidityLevelType;
  wickSize: number;
  closeLocation: number;
  time: number;
  recencyCandles?: number | undefined;
  reactionStrength?: number | undefined;
  rvol?: number | undefined;
};

export type ZoneType = "DEMAND" | "SUPPLY";

export type Zone = {
  id: string;
  type: ZoneType;
  topPrice: number;
  bottomPrice: number;
  time: number;
  isFresh: boolean;
  testCount: number;
  volumeConfirm: number;
  rvol?: number | undefined;
  displacementStrength?: number | undefined;
  mitigationPct?: number | undefined;
};

export type FVG = {
  direction: "BULLISH" | "BEARISH";
  topPrice: number;
  bottomPrice: number;
  time: number;
  size: number;
  sizeRatioToAtr?: number | undefined;
  filledPercentage: number;
  isFresh: boolean;
  rvol?: number | undefined;
  displacementStrength?: number | undefined;
};

export type SetupType =
  | "LIQUIDITY_SWEEP"
  | "BOS"
  | "CHoCH"
  | "DEMAND_ZONE"
  | "SUPPLY_ZONE"
  | "FVG_RETEST"
  | "ORDER_BLOCK_RETEST";

export type Confirmation = {
  volume: boolean;
  momentum: boolean;
  structure: boolean;
  rejectionWick?: boolean | undefined;
};

export type EngineWeights = {
  HTF_TrendAlignment: number;
  ExternalMarketStructure: number;
  InternalMarketStructure: number;
  LiquiditySweep: number;
  SupplyDemandZone: number;
  FVGRetest: number;
  VolumeExpansion: number;
  MomentumAlignment: number;
  VolatilityRegime: number;
};

export type EngineConfig = {
  minimumConfluenceScore: number;
  minimumDirectionalEdge: number;
  minimumRR: number;
  atrMultiplier: number;
  pivotStrength: number;
  volumeThreshold: number;
  signalExpiration: number;
  minimumLiquidityStrength: number;
  maxStopLossAtrMultiplier: number;
  minStopLossAtrMultiplier: number;
  weights: EngineWeights;
  minimumScore?: number | undefined;
  minimumSetupScore?: number | undefined;
  minimumEntryScore?: number | undefined;
};

export type { Candle };

export type PartialEngineConfig = {
  [K in keyof EngineConfig]?: EngineConfig[K] | undefined;
};

export type EvidenceItem = {
  label: string;
  detail: string;
  score: number;
  max: number;
  aligned: boolean;
  direction: "LONG" | "SHORT";
};

export type DirectionalScoreResult = {
  direction: "LONG" | "SHORT";
  score: number;
  evidence: EvidenceItem[];
};

export type Targets = {
  tp1: number;
  tp2: number;
  tp3: number;
};

export type RiskReward = {
  tp1: number;
  tp2: number;
  tp3: number;
};

export type Signal = {
  symbol: string;
  direction: "LONG" | "SHORT" | "NO TRADE";
  confluenceScore: number;
  confidence: "High" | "Moderate" | "Low";
  directionalEdge: number;
  longScore: number;
  shortScore: number;
  marketRegime: MarketRegime;
  timeframes: {
    "1D": string;
    "4H": string;
    "1H": string;
    "15M": string;
    "5M": string;
  };
  setupType: SetupType[];
  confirmation: Confirmation;
  entry: number;
  stopLoss: number;
  takeProfit: Targets;
  riskReward: RiskReward;
  invalidation: string;
  reasons: string[];
  rejectionReasons: string[];
  evidence: EvidenceItem[];
  // Legacy aliases
  setupScore: number;
  entryScore: number;
  finalScore: number;
};

export type TimeframeContext = {
  regime: MarketRegime;
  structure: MarketStructure;
  liquidity: LiquidityLevel[];
  zones: Zone[];
  fvgs: FVG[];
};

export type MultiTimeframeData = {
  "5m": TimeframeContext & { candles: Candle[] };
  "15m": TimeframeContext & { candles: Candle[] };
  "1h": TimeframeContext & { candles: Candle[] };
  "4h": TimeframeContext & { candles: Candle[] };
  "1d": TimeframeContext & { candles: Candle[] };
};
