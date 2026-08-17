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
    candlesMacro: Candle[], // 1D (or 1W for swing, 4H for scalp)
    candlesRegime: Candle[], // 4H (or 1D for swing, 1H for scalp)
    candlesStructure: Candle[], // 1H (or 4H for swing, 15M for scalp)
    candlesSetup: Candle[], // 15M (or 1H for swing, 5M for scalp)
    candlesTrigger: Candle[], // 5M (or 15M for swing, 1M for scalp)
    tickerPrice: number,
    rawConfig?: PartialEngineConfig | undefined,
    primaryTimeframe = "15m",
  ): Signal {
    const config = validateEngineConfig(rawConfig);
    const lastPrice =
      tickerPrice ||
      candlesTrigger[candlesTrigger.length - 1]?.close ||
      candlesSetup[candlesSetup.length - 1]?.close ||
      0;

    // 1. Analyze Macro Context (Macro Trend Bias)
    const indMacro = computeIndicators(candlesMacro);
    const structMacro = MarketStructureEngine.detectDual(candlesMacro, 5, 3);
    const macroBias = indMacro.bias as "bullish" | "bearish" | "neutral";

    // 2. Analyze Regime & Major Structure
    const indRegime = computeIndicators(candlesRegime);
    const structRegime = MarketStructureEngine.detectDual(
      candlesRegime,
      config.pivotStrength,
      2,
    );
    const regime = MarketRegimeEngine.classify(candlesRegime, indRegime, structRegime);

    // 3. Analyze Structure & Liquidity Map
    const indStruct = computeIndicators(candlesStructure);
    const structMajor = MarketStructureEngine.detectDual(
      candlesStructure,
      config.pivotStrength,
      2,
    );
    const atrMajor = indStruct.atr || lastPrice * 0.015;
    const liquidityMajor = LiquidityEngine.mapLiquidity(
      candlesStructure,
      candlesMacro,
      structMajor.swings,
      atrMajor,
    );

    // 4. Analyze Setup Timeframe: Sweeps, Order Blocks, FVGs, Internal Structure
    const indSetup = computeIndicators(candlesSetup);
    const structSetup = MarketStructureEngine.detectDual(
      candlesSetup,
      config.pivotStrength,
      2,
    );
    const atrSetup = indSetup.atr || lastPrice * 0.008;
    const liquiditySetup = LiquidityEngine.mapLiquidity(
      candlesSetup,
      candlesMacro,
      structSetup.swings,
      atrSetup,
    );
    const zonesSetup = ZoneEngine.detectZones(candlesSetup, structSetup.swings, atrSetup);
    const fvgsSetup = ZoneEngine.detectFVGs(candlesSetup, atrSetup);
    const sweepSetup = LiquidityEngine.detectSweep(candlesSetup, liquiditySetup, atrSetup);

    // 5. Analyze Trigger Timeframe: RVOL, Volatility, Momentum
    const indTrigger = computeIndicators(candlesTrigger);
    const rvolTrigger = VolumeEngine.calculateRvol(candlesTrigger);
    const volStatsTrigger = VolatilityEngine.analyze(candlesTrigger, indTrigger.atr, lastPrice);

    // Active setups for LONG
    const activeDemandZone =
      zonesSetup.find(
        (z) =>
          z.type === "DEMAND" &&
          z.isFresh &&
          lastPrice <= z.topPrice * 1.01 &&
          lastPrice >= z.bottomPrice * 0.99,
      ) || null;
    const activeBullishFvg =
      fvgsSetup.find(
        (f) =>
          f.direction === "BULLISH" &&
          lastPrice <= f.topPrice * 1.01 &&
          lastPrice >= f.bottomPrice * 0.99,
      ) || null;
    const bullSweep = sweepSetup && sweepSetup.direction === "BULLISH" ? sweepSetup : null;
    const momLong = MomentumEngine.isSupported(indTrigger.rsi, indTrigger.macd, "LONG");

    // Active setups for SHORT
    const activeSupplyZone =
      zonesSetup.find(
        (z) =>
          z.type === "SUPPLY" &&
          z.isFresh &&
          lastPrice >= z.bottomPrice * 0.99 &&
          lastPrice <= z.topPrice * 1.01,
      ) || null;
    const activeBearishFvg =
      fvgsSetup.find(
        (f) =>
          f.direction === "BEARISH" &&
          lastPrice >= f.bottomPrice * 0.99 &&
          lastPrice <= f.topPrice * 1.01,
      ) || null;
    const bearSweep = sweepSetup && sweepSetup.direction === "BEARISH" ? sweepSetup : null;
    const momShort = MomentumEngine.isSupported(indTrigger.rsi, indTrigger.macd, "SHORT");

    // 6. Independent Long & Short Scoring
    const longScoreResult = ConfluenceEngine.evaluateDirection(
      "LONG",
      macroBias,
      structRegime,
      structSetup,
      bullSweep,
      activeDemandZone,
      activeBullishFvg,
      rvolTrigger.rvol,
      momLong.ok,
      volStatsTrigger.isHealthy,
      config,
    );

    const shortScoreResult = ConfluenceEngine.evaluateDirection(
      "SHORT",
      macroBias,
      structRegime,
      structSetup,
      bearSweep,
      activeSupplyZone,
      activeBearishFvg,
      rvolTrigger.rvol,
      momShort.ok,
      volStatsTrigger.isHealthy,
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
      ? structSetup.swings.filter((s) => s.type === "low")
      : structSetup.swings.filter((s) => s.type === "high");
    const lastSwing = relevantSwings[relevantSwings.length - 1] || null;

    // Trigger confirmation check
    const hasTriggerConfirmation =
      rvolTrigger.isExpanding ||
      (isLong
        ? indTrigger.rsi >= 45 && indTrigger.rsi <= 65
        : indTrigger.rsi <= 55 && indTrigger.rsi >= 35);

    // Calculate Entry Model & Zones
    const entryResult = EntryEngine.calculateEntry(
      lastPrice,
      candidateDir,
      relevantSweep,
      relevantZone,
      relevantFvg,
      lastSwing,
      atrSetup,
      hasTriggerConfirmation,
    );
    const entry = entryResult.entryPrice;

    // Calculate Protected Structural Stop Loss
    const stopResult = StopLossEngine.calculateStop(
      entry,
      candidateDir,
      structSetup.swings,
      relevantZone,
      relevantFvg,
      atrSetup,
      config.atrMultiplier * 0.25,
      config.maxStopLossAtrMultiplier,
      config.minStopLossAtrMultiplier,
    );
    const stopLoss = stopResult.stopLoss;

    // Calculate Genuine Structural Take Profit Targets
    const targets = TakeProfitEngine.calculateTargets(
      entry,
      stopLoss,
      candidateDir,
      [...liquidityMajor, ...liquiditySetup],
      zonesSetup,
      atrSetup,
      config.minimumRR,
    );

    // Calculate Risk & Net R:R Metrics (including fees & slippage)
    const riskAnalysis = RiskEngine.analyze(
      entry,
      stopLoss,
      targets,
      candidateDir,
      1000,
      1.0,
      config.makerFeeBps,
      config.takerFeeBps,
      config.slippageBps,
    );
    const tp2Rr = riskAnalysis ? riskAnalysis.riskReward.tp2 : 0;

    // Check if internal reversal CHoCH is present on LTF
    const hasLTFReversal = isLong
      ? (structSetup.internalChoch || []).some((c) => c.type === "CHOCH_BULL")
      : (structSetup.internalChoch || []).some((c) => c.type === "CHOCH_BEAR");

    // 8. Resolve Setup & Apply Hard Quality Gates & Structured Rejection Hierarchy
    const resolution = ConfluenceEngine.resolveSetup(
      longScoreResult,
      shortScoreResult,
      stopResult.isValid,
      stopResult.reason,
      volStatsTrigger.isHealthy,
      tp2Rr,
      targets.isStructural ?? true,
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
      (structSetup.internalBos?.some((b) => b.type === "BOS_BULL") ||
        structSetup.bos.some((b) => b.type === "BOS_BULL"))
    )
      setupType.push("BOS");
    if (
      isLong &&
      (structSetup.internalChoch?.some((c) => c.type === "CHOCH_BULL") ||
        structSetup.choch.some((c) => c.type === "CHOCH_BULL"))
    )
      setupType.push("CHoCH");
    if (
      !isLong &&
      (structSetup.internalBos?.some((b) => b.type === "BOS_BEAR") ||
        structSetup.bos.some((b) => b.type === "BOS_BEAR"))
    )
      setupType.push("BOS");
    if (
      !isLong &&
      (structSetup.internalChoch?.some((c) => c.type === "CHOCH_BEAR") ||
        structSetup.choch.some((c) => c.type === "CHOCH_BEAR"))
    )
      setupType.push("CHoCH");

    const invalidation = isLong
      ? `Closed candle below structural support (${stopResult.anchorType}) at $${stopLoss.toLocaleString()}`
      : `Closed candle above structural resistance (${stopResult.anchorType}) at $${stopLoss.toLocaleString()}`;

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
      timeframeRole: primaryTimeframe,
      timeframes: {
        macro: macroBias.toUpperCase(),
        setup: setupType.join("+") || "STRUCTURE",
        trigger: resolution.decision !== "NO TRADE" ? "CONFIRMED" : "INSUFFICIENT",
        execution: "5M",
        // Backward compatibility
        "1D": macroBias.toUpperCase(),
        "4H": regime,
        "1H": structMajor.bos.length ? "TRENDING" : "RANGING",
        "15M": setupType.join("+") || "NO_SETUP",
        "5M": resolution.decision !== "NO TRADE" ? "CONFIRMED" : "INSUFFICIENT",
      },
      setupType,
      entryType: entryResult.entryType,
      entryZone: entryResult.entryZone,
      triggerCondition: entryResult.triggerCondition,
      expirationCandles: entryResult.expirationCandles,
      confirmation: {
        volume: rvolTrigger.isExpanding,
        momentum: isLong ? momLong.ok : momShort.ok,
        structure: isLong
          ? structSetup.bos.some((b) => b.type === "BOS_BULL") ||
            structSetup.choch.some((c) => c.type === "CHOCH_BULL")
          : structSetup.bos.some((b) => b.type === "BOS_BEAR") ||
            structSetup.choch.some((c) => c.type === "CHOCH_BEAR"),
        rejectionWick: !!relevantSweep,
      },
      entry,
      stopLoss,
      takeProfit: targets,
      riskReward: riskAnalysis ? riskAnalysis.riskReward : { tp1: 0, tp2: 0, tp3: 0 },
      invalidation,
      reasons,
      rejectionReasons: resolution.rejectionReasons,
      rejectionHierarchy: resolution.rejectionHierarchy,
      evidence: resolution.selectedEvidence,
      // Legacy aliases
      setupScore: resolution.confluenceScore,
      entryScore: resolution.confluenceScore,
      finalScore: resolution.confluenceScore,
    };
  }
}
