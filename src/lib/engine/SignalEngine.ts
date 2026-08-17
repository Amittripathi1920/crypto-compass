import type { Candle } from "../indicators";
import { computeIndicators } from "../indicators";
import type { EngineConfig, PartialEngineConfig, Signal, SetupType } from "./types";
import { DEFAULT_CONFIG, validateEngineConfig } from "./config";
import { MarketRegimeEngine } from "./MarketRegimeEngine";
import { MarketStructureEngine } from "./MarketStructureEngine";
import { LiquidityEngine } from "./LiquidityEngine";
import { ZoneEngine } from "./ZoneEngine";
import { MomentumEngine, VolumeEngine, VolatilityEngine } from "./TechnicalConfirmationEngines";
import { EntryEngine, StopLossEngine, TakeProfitEngine, RiskEngine } from "./TradeExecutionEngines";
import { ConfluenceEngine } from "./ConfluenceEngine";

export class SignalEngine {
  public static run(
    symbol: string,
    candles1d: Candle[],
    candles4h: Candle[],
    candles1h: Candle[],
    candles15m: Candle[],
    candles5m: Candle[],
    tickerPrice: number,
    rawConfig?: PartialEngineConfig | undefined,
  ): Signal {
    const config = validateEngineConfig(rawConfig);
    const lastPrice =
      tickerPrice ||
      candles5m[candles5m.length - 1]?.close ||
      candles15m[candles15m.length - 1]?.close ||
      0;

    // 1. Analyze 1D (Macro Trend Bias)
    const ind1d = computeIndicators(candles1d);
    const struct1d = MarketStructureEngine.detectDual(candles1d, 5, 3);
    const macroBias = ind1d.bias as "bullish" | "bearish" | "neutral";

    // 2. Analyze 4H (Market Regime & Major External Structure)
    const ind4h = computeIndicators(candles4h);
    const struct4h = MarketStructureEngine.detectDual(candles4h, config.pivotStrength, 2);
    const regime = MarketRegimeEngine.classify(candles4h, ind4h, struct4h);

    // 3. Analyze 1H (Major Structure & Liquidity Map)
    const ind1h = computeIndicators(candles1h);
    const struct1h = MarketStructureEngine.detectDual(candles1h, config.pivotStrength, 2);
    const atr1h = ind1h.atr || lastPrice * 0.015;
    const liquidity1h = LiquidityEngine.mapLiquidity(candles1h, candles1d, struct1h.swings, atr1h);

    // 4. Analyze 15M (Setup Timeframe: Sweeps, Order Blocks, FVGs, Internal Structure)
    const ind15m = computeIndicators(candles15m);
    const struct15m = MarketStructureEngine.detectDual(candles15m, config.pivotStrength, 2);
    const atr15m = ind15m.atr || lastPrice * 0.008;
    const liquidity15m = LiquidityEngine.mapLiquidity(
      candles15m,
      candles1d,
      struct15m.swings,
      atr15m,
    );
    const zones15m = ZoneEngine.detectZones(candles15m, struct15m.swings, atr15m);
    const fvgs15m = ZoneEngine.detectFVGs(candles15m, atr15m);
    const sweep15m = LiquidityEngine.detectSweep(candles15m, liquidity15m, atr15m);

    // 5. Analyze 5M (Micro Trigger: RVOL, Volatility, Momentum)
    const ind5m = computeIndicators(candles5m);
    const rvol5m = VolumeEngine.calculateRvol(candles5m);
    const volStats5m = VolatilityEngine.analyze(candles5m, ind5m.atr, lastPrice);

    // Active setups for LONG
    const activeDemandZone =
      zones15m.find(
        (z) =>
          z.type === "DEMAND" &&
          z.isFresh &&
          lastPrice <= z.topPrice * 1.01 &&
          lastPrice >= z.bottomPrice * 0.99,
      ) || null;
    const activeBullishFvg =
      fvgs15m.find(
        (f) =>
          f.direction === "BULLISH" &&
          lastPrice <= f.topPrice * 1.01 &&
          lastPrice >= f.bottomPrice * 0.99,
      ) || null;
    const bullSweep = sweep15m && sweep15m.direction === "BULLISH" ? sweep15m : null;
    const momLong = MomentumEngine.isSupported(ind5m.rsi, ind5m.macd, "LONG");

    // Active setups for SHORT
    const activeSupplyZone =
      zones15m.find(
        (z) =>
          z.type === "SUPPLY" &&
          z.isFresh &&
          lastPrice >= z.bottomPrice * 0.99 &&
          lastPrice <= z.topPrice * 1.01,
      ) || null;
    const activeBearishFvg =
      fvgs15m.find(
        (f) =>
          f.direction === "BEARISH" &&
          lastPrice >= f.bottomPrice * 0.99 &&
          lastPrice <= f.topPrice * 1.01,
      ) || null;
    const bearSweep = sweep15m && sweep15m.direction === "BEARISH" ? sweep15m : null;
    const momShort = MomentumEngine.isSupported(ind5m.rsi, ind5m.macd, "SHORT");

    // 6. Independent Long & Short Scoring
    const longScoreResult = ConfluenceEngine.evaluateDirection(
      "LONG",
      macroBias,
      struct4h,
      struct15m,
      bullSweep,
      activeDemandZone,
      activeBullishFvg,
      rvol5m.rvol,
      momLong.ok,
      volStats5m.isHealthy,
      config,
    );

    const shortScoreResult = ConfluenceEngine.evaluateDirection(
      "SHORT",
      macroBias,
      struct4h,
      struct15m,
      bearSweep,
      activeSupplyZone,
      activeBearishFvg,
      rvol5m.rvol,
      momShort.ok,
      volStats5m.isHealthy,
      config,
    );

    // 7. Determine provisional candidate direction for level calculations
    const candidateDir: "LONG" | "SHORT" =
      longScoreResult.score >= shortScoreResult.score ? "LONG" : "SHORT";
    const isLong = candidateDir === "LONG";

    const relevantSweep = isLong ? bullSweep : bearSweep;
    const relevantZone = isLong ? activeDemandZone : activeSupplyZone;
    const relevantFvg = isLong ? activeBullishFvg : activeBearishFvg;
    const relevantSwings = isLong
      ? struct15m.swings.filter((s) => s.type === "low")
      : struct15m.swings.filter((s) => s.type === "high");
    const lastSwing = relevantSwings[relevantSwings.length - 1] || null;

    // Check 5M micro confirmation
    const has5mConfirmation =
      rvol5m.isExpanding ||
      (isLong ? ind5m.rsi >= 45 && ind5m.rsi <= 65 : ind5m.rsi <= 55 && ind5m.rsi >= 35);

    // Calculate Entry
    const entryResult = EntryEngine.calculateEntry(
      lastPrice,
      candidateDir,
      relevantSweep,
      relevantZone,
      relevantFvg,
      lastSwing,
      atr15m,
      has5mConfirmation,
    );
    const entry = entryResult.entryPrice;

    // Calculate Stop Loss
    const stopResult = StopLossEngine.calculateStop(
      entry,
      candidateDir,
      struct15m.swings,
      relevantZone,
      relevantFvg,
      atr15m,
      config.atrMultiplier * 0.25,
      config.maxStopLossAtrMultiplier,
      config.minStopLossAtrMultiplier,
    );
    const stopLoss = stopResult.stopLoss;

    // Calculate Take Profit Targets
    const targets = TakeProfitEngine.calculateTargets(
      entry,
      stopLoss,
      candidateDir,
      liquidity1h,
      zones15m,
      atr15m,
    );

    // Calculate Risk & R:R Metrics
    const riskAnalysis = RiskEngine.analyze(entry, stopLoss, targets, candidateDir, 1000, 1.0);
    const tp2Rr = riskAnalysis ? riskAnalysis.riskReward.tp2 : 0;

    // Check if internal reversal CHoCH is present on LTF
    const hasLTFReversal = isLong
      ? (struct15m.internalChoch || []).some((c) => c.type === "CHOCH_BULL")
      : (struct15m.internalChoch || []).some((c) => c.type === "CHOCH_BEAR");

    // 8. Resolve Setup & Apply Quality Gates
    const resolution = ConfluenceEngine.resolveSetup(
      longScoreResult,
      shortScoreResult,
      stopResult.isValid,
      stopResult.reason,
      volStats5m.isHealthy,
      tp2Rr,
      entryResult.isConfirmed,
      regime,
      hasLTFReversal,
      config,
    );

    // Setup Types present
    const setupType: SetupType[] = [];
    if (relevantSweep) setupType.push("LIQUIDITY_SWEEP");
    if (relevantZone)
      setupType.push(relevantZone.type === "DEMAND" ? "DEMAND_ZONE" : "SUPPLY_ZONE");
    if (relevantFvg) setupType.push("FVG_RETEST");
    if (
      isLong &&
      (struct15m.internalBos?.some((b) => b.type === "BOS_BULL") ||
        struct15m.bos.some((b) => b.type === "BOS_BULL"))
    )
      setupType.push("BOS");
    if (
      isLong &&
      (struct15m.internalChoch?.some((c) => c.type === "CHOCH_BULL") ||
        struct15m.choch.some((c) => c.type === "CHOCH_BULL"))
    )
      setupType.push("CHoCH");
    if (
      !isLong &&
      (struct15m.internalBos?.some((b) => b.type === "BOS_BEAR") ||
        struct15m.bos.some((b) => b.type === "BOS_BEAR"))
    )
      setupType.push("BOS");
    if (
      !isLong &&
      (struct15m.internalChoch?.some((c) => c.type === "CHOCH_BEAR") ||
        struct15m.choch.some((c) => c.type === "CHOCH_BEAR"))
    )
      setupType.push("CHoCH");

    const invalidation = isLong
      ? `15M candle close below structural support at $${stopLoss.toLocaleString()}`
      : `15M candle close above structural resistance at $${stopLoss.toLocaleString()}`;

    const reasons = resolution.selectedEvidence
      .filter((e) => e.aligned)
      .map((e) => `${e.label}: ${e.detail} (+${e.score}/${e.max} pts)`);

    return {
      symbol,
      direction: resolution.decision,
      confluenceScore: resolution.confluenceScore,
      confidence: resolution.confidence,
      directionalEdge: resolution.directionalEdge,
      longScore: resolution.longScore,
      shortScore: resolution.shortScore,
      marketRegime: regime,
      timeframes: {
        "1D": macroBias.toUpperCase(),
        "4H": regime,
        "1H": struct1h.bos.length ? "TRENDING" : "RANGING",
        "15M": setupType.join("+") || "NO_SETUP",
        "5M": resolution.decision !== "NO TRADE" ? "CONFIRMED" : "INSUFFICIENT",
      },
      setupType,
      confirmation: {
        volume: rvol5m.isExpanding,
        momentum: isLong ? momLong.ok : momShort.ok,
        structure: isLong
          ? struct15m.bos.some((b) => b.type === "BOS_BULL") ||
            struct15m.choch.some((c) => c.type === "CHOCH_BULL")
          : struct15m.bos.some((b) => b.type === "BOS_BEAR") ||
            struct15m.choch.some((c) => c.type === "CHOCH_BEAR"),
        rejectionWick: !!relevantSweep,
      },
      entry,
      stopLoss,
      takeProfit: targets,
      riskReward: riskAnalysis ? riskAnalysis.riskReward : { tp1: 0, tp2: 0, tp3: 0 },
      invalidation,
      reasons,
      rejectionReasons: resolution.rejectionReasons,
      evidence: resolution.selectedEvidence,
      // Legacy aliases
      setupScore: resolution.confluenceScore,
      entryScore: resolution.confluenceScore,
      finalScore: resolution.confluenceScore,
    };
  }
}
