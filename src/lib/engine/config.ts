import type { EngineConfig } from "./types";

export const DEFAULT_CONFIG: EngineConfig = {
  minimumScore: 60,
  minimumSetupScore: 60,
  minimumEntryScore: 60,
  minimumRR: 1.5,
  atrMultiplier: 1.5,
  pivotStrength: 4,
  volumeThreshold: 1.2, // 1.2x of volume SMA
  signalExpiration: 12, // Expire setup after 12 candles if entry not filled
  minimumLiquidityStrength: 10,
};

export const WEIGHTS = {
  HTF_TrendAlignment: 20,
  MarketStructure: 20,
  Liquidity: 15,
  SupplyDemand: 10,
  Volume: 10,
  Momentum: 10,
  EntryConfirmation: 10,
  Volatility: 5,
};
