import type { Candle } from "../indicators";
import { computeIndicators } from "../indicators";
import type { EngineConfig, MultiTimeframeData, TimeframeContext, SetupType } from "./types";
import { DEFAULT_CONFIG } from "./config";
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
    config: EngineConfig = DEFAULT_CONFIG
  ) {
    const lastPrice = tickerPrice || candles5m[candles5m.length - 1]?.close || 0;
    
    // 1. Analyze 1D (Macro Trend)
    const ind1d = computeIndicators(candles1d);
    const struct1d = MarketStructureEngine.detect(candles1d, config.pivotStrength);
    const macroBias = ind1d.bias; // "bullish" or "bearish"

    // 2. Analyze 4H (Primary Market Regime)
    const ind4h = computeIndicators(candles4h);
    const struct4h = MarketStructureEngine.detect(candles4h, config.pivotStrength);
    const regime = MarketRegimeEngine.classify(candles4h, ind4h, struct4h);

    // 3. Analyze 1H (Major Structure & Liquidity Map)
    const ind1h = computeIndicators(candles1h);
    const struct1h = MarketStructureEngine.detect(candles1h, config.pivotStrength);
    const atr1h = ind1h.atr;
    const liquidity1h = LiquidityEngine.mapLiquidity(candles1h, candles1d, struct1h.swings, atr1h);
    const zones1h = ZoneEngine.detectZones(candles1h, struct1h.swings, atr1h);

    // 4. Analyze 15M (Setup Development: Sweeps, Zones, FVG)
    const ind15m = computeIndicators(candles15m);
    const struct15m = MarketStructureEngine.detect(candles15m, config.pivotStrength);
    const atr15m = ind15m.atr;
    const liquidity15m = LiquidityEngine.mapLiquidity(candles15m, candles1d, struct15m.swings, atr15m);
    const zones15m = ZoneEngine.detectZones(candles15m, struct15m.swings, atr15m);
    const fvgs15m = ZoneEngine.detectFVGs(candles15m);
    
    const sweep15m = LiquidityEngine.detectSweep(candles15m, liquidity15m, atr15m);

    // 5. Analyze 5M (Entry Confirmation: RVOL, Momentum, Rejection)
    const ind5m = computeIndicators(candles5m);
    const rvol5m = VolumeEngine.calculateRvol(candles5m);
    const volStats5m = VolatilityEngine.analyze(candles5m, ind5m.atr, lastPrice);

    // Check potential setup directions
    // Setup Candidates
    let potentialDirection: "LONG" | "SHORT" | null = null;
    let setupType: SetupType[] = [];
    let matchedZone: typeof zones15m[number] | null = null;
    let matchedFvg: typeof fvgs15m[number] | null = null;

    // Check Bullish Setups
    const isBullishSweep = sweep15m && sweep15m.direction === "BULLISH";
    // Check if price is within a fresh 15M demand zone
    const activeDemandZone = zones15m.find((z) => z.type === "DEMAND" && z.isFresh && lastPrice <= z.topPrice && lastPrice >= z.bottomPrice) || null;
    // Check if price is within a fresh 15M bullish FVG
    const activeBullishFvg = fvgs15m.find((f) => f.direction === "BULLISH" && lastPrice <= f.topPrice && lastPrice >= f.bottomPrice) || null;
    // Check if 15M structure recently broke out bullish
    const hasBullishBos = struct15m.bos.some((b) => b.type === "BOS_BULL" && Date.now() - b.time < 3 * 15 * 60 * 1000);
    const hasBullishChoch = struct15m.choch.some((c) => c.type === "CHOCH_BULL" && Date.now() - c.time < 3 * 15 * 60 * 1000);

    // Check Bearish Setups
    const isBearishSweep = sweep15m && sweep15m.direction === "BEARISH";
    const activeSupplyZone = zones15m.find((z) => z.type === "SUPPLY" && z.isFresh && lastPrice >= z.bottomPrice && lastPrice <= z.topPrice) || null;
    const activeBearishFvg = fvgs15m.find((f) => f.direction === "BEARISH" && lastPrice >= f.bottomPrice && lastPrice <= f.topPrice) || null;
    const hasBearishBos = struct15m.bos.some((b) => b.type === "BOS_BEAR" && Date.now() - b.time < 3 * 15 * 60 * 1000);
    const hasBearishChoch = struct15m.choch.some((c) => c.type === "CHOCH_BEAR" && Date.now() - c.time < 3 * 15 * 60 * 1000);

    if (isBullishSweep || activeDemandZone || activeBullishFvg || hasBullishBos || hasBullishChoch) {
      potentialDirection = "LONG";
      if (isBullishSweep) setupType.push("LIQUIDITY_SWEEP");
      if (activeDemandZone) {
        setupType.push("DEMAND_ZONE");
        matchedZone = activeDemandZone;
      }
      if (activeBullishFvg) {
        setupType.push("FVG_RETEST");
        matchedFvg = activeBullishFvg;
      }
      if (hasBullishBos) setupType.push("BOS");
      if (hasBullishChoch) setupType.push("CHoCH");
    } else if (isBearishSweep || activeSupplyZone || activeBearishFvg || hasBearishBos || hasBearishChoch) {
      potentialDirection = "SHORT";
      if (isBearishSweep) setupType.push("LIQUIDITY_SWEEP");
      if (activeSupplyZone) {
        setupType.push("SUPPLY_ZONE");
        matchedZone = activeSupplyZone;
      }
      if (activeBearishFvg) {
        setupType.push("FVG_RETEST");
        matchedFvg = activeBearishFvg;
      }
      if (hasBearishBos) setupType.push("BOS");
      if (hasBearishChoch) setupType.push("CHoCH");
    }

    if (!potentialDirection) {
      return {
        symbol,
        direction: "NO TRADE" as const,
        setupScore: 0,
        entryScore: 0,
        finalScore: 0,
        marketRegime: regime,
        entry: 0,
        stopLoss: 0,
        takeProfit: { tp1: 0, tp2: 0, tp3: 0 },
        riskReward: { tp1: 0, tp2: 0, tp3: 0 },
        timeframes: {
          "1D": macroBias.toUpperCase(),
          "4H": regime,
          "1H": struct1h.bos.length ? "TRENDING" : "RANGING",
          "15M": setupType.join("+") || "NO_SETUP",
          "5M": "MONITORING"
        },
        setupType: [] as SetupType[],
        confirmation: { volume: false, momentum: false, structure: false },
        invalidation: "No invalidation level calculated.",
        reasons: ["Market currently lacks a high-quality setup."],
        rejectionReasons: ["No setup pattern (sweep, zone, BOS) identified on primary timeframe."]
      };
    }

    // 6. Calculate Levels & Risk metrics
    // Calculate entry based on balanced mode (wait for retracement)
    const entry = EntryEngine.calculateEntry(lastPrice, potentialDirection, "balanced", matchedZone, matchedFvg, atr15m);
    
    // Stop loss placement is structural + ATR buffer
    const stopResult = StopLossEngine.calculateStop(entry, potentialDirection, struct15m.swings, atr15m, config.atrMultiplier * 0.15);
    const stopLoss = stopResult.stopLoss;

    // Take profit based on structure/liquidity
    const targets = TakeProfitEngine.calculateTargets(entry, stopLoss, potentialDirection, liquidity1h, zones15m, atr15m);

    const riskAnalysis = RiskEngine.analyze(entry, stopLoss, targets, potentialDirection, 1000, 1.0);
    const tp2Rr = riskAnalysis ? riskAnalysis.riskReward.tp2 : 0;

    // Confluence Scoring
    const htfTrendMatch = potentialDirection === "LONG" ? macroBias === "bullish" : macroBias === "bearish";
    const hasBOSorCHoCH = potentialDirection === "LONG" 
      ? (hasBullishBos || hasBullishChoch) 
      : (hasBearishBos || hasBearishChoch);
      
    const momentumOk = MomentumEngine.isSupported(ind5m.rsi, ind5m.macd, potentialDirection).ok;

    const confluence = ConfluenceEngine.evaluate(
      potentialDirection,
      htfTrendMatch,
      hasBOSorCHoCH,
      sweep15m,
      matchedZone,
      matchedFvg,
      rvol5m.rvol,
      momentumOk,
      volStats5m.isHealthy,
      tp2Rr,
      stopResult.isValid,
      config
    );

    const invalidation = potentialDirection === "LONG"
      ? `15M candle close below swing low support at $${stopLoss.toLocaleString()}`
      : `15M candle close above swing high resistance at $${stopLoss.toLocaleString()}`;

    return {
      symbol,
      direction: confluence.decision,
      setupScore: confluence.setupScore,
      entryScore: confluence.entryScore,
      finalScore: confluence.finalScore,
      marketRegime: regime,
      entry,
      stopLoss,
      takeProfit: {
        tp1: targets.tp1,
        tp2: targets.tp2,
        tp3: targets.tp3
      },
      riskReward: riskAnalysis ? riskAnalysis.riskReward : { tp1: 0, tp2: 0, tp3: 0 },
      timeframes: {
        "1D": macroBias.toUpperCase(),
        "4H": regime,
        "1H": struct1h.bos.length ? "TRENDING" : "RANGING",
        "15M": setupType.join("+"),
        "5M": confluence.decision !== "NO TRADE" ? "CONFIRMED" : "INSUFFICIENT"
      },
      setupType,
      confirmation: {
        volume: rvol5m.isExpanding,
        momentum: momentumOk,
        structure: hasBOSorCHoCH
      },
      invalidation,
      reasons: confluence.reasons.map((r) => `${r.label}: ${r.detail}`),
      rejectionReasons: confluence.rejectionReasons
    };
  }
}
