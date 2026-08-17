import { z } from "zod";
import type { EngineConfig, EngineWeights, PartialEngineConfig } from "./types";

export const WEIGHTS: EngineWeights = {
  HTF_TrendAlignment: 20,
  ExternalMarketStructure: 15,
  InternalMarketStructure: 10,
  LiquiditySweep: 15,
  SupplyDemandZone: 10,
  FVGRetest: 10,
  VolumeExpansion: 10,
  MomentumAlignment: 5,
  VolatilityRegime: 5,
};

export const DEFAULT_CONFIG: EngineConfig = {
  minimumConfluenceScore: 60,
  minimumDirectionalEdge: 12, // Required point difference between Long and Short score
  minimumRR: 1.5,
  atrMultiplier: 1.5,
  pivotStrength: 4,
  volumeThreshold: 1.2, // 1.2x of volume SMA
  signalExpiration: 12, // Expire setup after 12 candles if entry not filled
  minimumLiquidityStrength: 10,
  maxStopLossAtrMultiplier: 4.5, // Stop loss beyond 4.5 ATR is considered too wide / high risk
  minStopLossAtrMultiplier: 0.4, // Stop loss tighter than 0.4 ATR is considered market noise
  requireStructuralTargets: true, // Must have genuine opposing liquidity; rejects manufactured targets
  makerFeeBps: 2, // 0.02% maker fee
  takerFeeBps: 5, // 0.05% taker fee
  slippageBps: 4, // 4 bps estimated execution slippage
  weights: WEIGHTS,
  // Backward compatibility aliases
  minimumScore: 60,
  minimumSetupScore: 60,
  minimumEntryScore: 60,
};

export const EngineWeightsSchema = z
  .object({
    HTF_TrendAlignment: z.number().min(0).max(50),
    ExternalMarketStructure: z.number().min(0).max(50),
    InternalMarketStructure: z.number().min(0).max(50),
    LiquiditySweep: z.number().min(0).max(50),
    SupplyDemandZone: z.number().min(0).max(50),
    FVGRetest: z.number().min(0).max(50),
    VolumeExpansion: z.number().min(0).max(50),
    MomentumAlignment: z.number().min(0).max(50),
    VolatilityRegime: z.number().min(0).max(50),
  })
  .refine(
    (w) => {
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      return Math.abs(sum - 100) < 0.01;
    },
    {
      message: "Engine weights must sum to exactly 100",
    },
  );

export const EngineConfigSchema = z.object({
  minimumConfluenceScore: z.number().min(10).max(95).default(60),
  minimumDirectionalEdge: z.number().min(0).max(50).default(12),
  minimumRR: z.number().min(0.5).max(10).default(1.5),
  atrMultiplier: z.number().min(0.5).max(5).default(1.5),
  pivotStrength: z.number().min(2).max(10).default(4),
  volumeThreshold: z.number().min(0.8).max(3).default(1.2),
  signalExpiration: z.number().min(1).max(100).default(12),
  minimumLiquidityStrength: z.number().min(1).max(100).default(10),
  maxStopLossAtrMultiplier: z.number().min(2).max(10).default(4.5),
  minStopLossAtrMultiplier: z.number().min(0.1).max(2).default(0.4),
  requireStructuralTargets: z.boolean().default(true),
  makerFeeBps: z.number().min(0).max(100).default(2),
  takerFeeBps: z.number().min(0).max(100).default(5),
  slippageBps: z.number().min(0).max(100).default(4),
  weights: EngineWeightsSchema.default(WEIGHTS),
  minimumScore: z.number().optional(),
  minimumSetupScore: z.number().optional(),
  minimumEntryScore: z.number().optional(),
});

export function validateEngineConfig(config?: PartialEngineConfig | undefined): EngineConfig {
  if (!config) return DEFAULT_CONFIG;
  const merged = {
    ...DEFAULT_CONFIG,
    ...config,
    minimumConfluenceScore:
      config.minimumConfluenceScore ?? config.minimumScore ?? DEFAULT_CONFIG.minimumConfluenceScore,
    weights: {
      ...DEFAULT_CONFIG.weights,
      ...(config.weights || {}),
    },
  };
  return EngineConfigSchema.parse(merged) as EngineConfig;
}
