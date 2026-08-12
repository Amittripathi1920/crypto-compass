import type { Candle } from "../indicators";

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
};

export type BOS = {
  type: "BOS_BULL" | "BOS_BEAR";
  price: number;
  time: number;
  sourceSwingIndex: number;
  strength: number;
};

export type CHoCH = {
  type: "CHOCH_BULL" | "CHOCH_BEAR";
  price: number;
  time: number;
  sourceSwingIndex: number;
  strength: number;
};

export type MarketStructure = {
  swings: SwingPoint[];
  bos: BOS[];
  choch: CHoCH[];
};

export type LiquidityLevelType =
  | "PDH"
  | "PDL"
  | "PWH"
  | "PWL"
  | "EQH"
  | "EQL"
  | "SWING_HIGH"
  | "SWING_LOW";

export type LiquidityLevel = {
  id: string;
  type: LiquidityLevelType;
  price: number;
  strength: number;
  isSwept: boolean;
  time: number;
};

export type LiquiditySweep = {
  direction: "BULLISH" | "BEARISH";
  sweptLevelPrice: number;
  sweptLevelType: LiquidityLevelType;
  wickSize: number;
  closeLocation: number;
  time: number;
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
};

export type FVG = {
  direction: "BULLISH" | "BEARISH";
  topPrice: number;
  bottomPrice: number;
  time: number;
  size: number;
  filledPercentage: number;
  isFresh: boolean;
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
};

export type EngineConfig = {
  minimumScore: number;
  minimumSetupScore: number;
  minimumEntryScore: number;
  minimumRR: number;
  atrMultiplier: number;
  pivotStrength: number;
  volumeThreshold: number;
  signalExpiration: number;
  minimumLiquidityStrength: number;
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
