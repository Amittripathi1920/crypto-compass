import type {
  EngineConfig,
  LiquiditySweep,
  Zone,
  FVG,
  MarketStructure,
  EvidenceItem,
  DirectionalScoreResult,
  MarketRegime,
} from "./types";
import { DEFAULT_CONFIG } from "./config";
import { MarketRegimeEngine } from "./MarketRegimeEngine";

export class ConfluenceEngine {
  /**
   * Evaluates directional confluence score (0 to 100) independently for either LONG or SHORT.
   * All weights are derived strictly from config.weights.
   */
  public static evaluateDirection(
    direction: "LONG" | "SHORT",
    htfMacroBias: "bullish" | "bearish" | "neutral",
    structHTF: MarketStructure,
    structLTF: MarketStructure,
    sweep: LiquiditySweep | null,
    zone: Zone | null,
    fvg: FVG | null,
    rvol: number,
    momentumOk: boolean,
    isVolHealthy: boolean,
    config: EngineConfig = DEFAULT_CONFIG,
  ): DirectionalScoreResult {
    const isLong = direction === "LONG";
    const weights = config.weights;
    const evidence: EvidenceItem[] = [];

    // 1. Higher-Timeframe Trend Alignment (Max: weights.HTF_TrendAlignment, default 20)
    const isHtfAligned = isLong ? htfMacroBias === "bullish" : htfMacroBias === "bearish";
    const isHtfNeutral = htfMacroBias === "neutral";
    const htfScore = isHtfAligned
      ? weights.HTF_TrendAlignment
      : isHtfNeutral
        ? Math.round(weights.HTF_TrendAlignment * 0.35)
        : 0;

    evidence.push({
      label: "HTF Trend Alignment",
      detail: isHtfAligned
        ? `1D macro trend is aligned with ${direction} setup.`
        : isHtfNeutral
          ? "1D macro trend is neutral/consolidating."
          : `1D macro trend opposes ${direction} bias.`,
      score: htfScore,
      max: weights.HTF_TrendAlignment,
      aligned: isHtfAligned,
      direction,
    });

    // 2. External Market Structure (Max: weights.ExternalMarketStructure, default 15)
    // Checks 4H/1H BOS and CHoCH
    const hasExtBos = isLong
      ? (structHTF.externalBos || structHTF.bos).some((b) => b.type === "BOS_BULL")
      : (structHTF.externalBos || structHTF.bos).some((b) => b.type === "BOS_BEAR");
    const hasExtChoch = isLong
      ? (structHTF.externalChoch || structHTF.choch).some((c) => c.type === "CHOCH_BULL")
      : (structHTF.externalChoch || structHTF.choch).some((c) => c.type === "CHOCH_BEAR");

    const hasExtStructure = hasExtBos || hasExtChoch;
    const extStructScore = hasExtStructure
      ? weights.ExternalMarketStructure
      : Math.round(weights.ExternalMarketStructure * 0.25);

    evidence.push({
      label: "HTF External Structure",
      detail: hasExtStructure
        ? `Confirmed HTF swing ${hasExtChoch ? "CHoCH (reversal)" : "BOS (continuation)"} supports ${direction}.`
        : "HTF market structure is ranging without clear external breakout.",
      score: extStructScore,
      max: weights.ExternalMarketStructure,
      aligned: hasExtStructure,
      direction,
    });

    // 3. Internal Market Structure (Max: weights.InternalMarketStructure, default 10)
    // Checks 15M internal pullback reversal or BOS
    const hasIntBos = isLong
      ? (structLTF.internalBos || structLTF.bos).some((b) => b.type === "BOS_BULL")
      : (structLTF.internalBos || structLTF.bos).some((b) => b.type === "BOS_BEAR");
    const hasIntChoch = isLong
      ? (structLTF.internalChoch || structLTF.choch).some((c) => c.type === "CHOCH_BULL")
      : (structLTF.internalChoch || structLTF.choch).some((c) => c.type === "CHOCH_BEAR");

    const hasIntStructure = hasIntChoch || hasIntBos;
    const intStructScore = hasIntChoch
      ? weights.InternalMarketStructure
      : hasIntBos
        ? Math.round(weights.InternalMarketStructure * 0.8)
        : Math.round(weights.InternalMarketStructure * 0.2);

    evidence.push({
      label: "LTF Internal Structure",
      detail: hasIntChoch
        ? `Confirmed LTF internal CHoCH reversal triggers entry in direction of ${direction}.`
        : hasIntBos
          ? `LTF internal BOS continuation supports ${direction}.`
          : "No internal structural trigger present.",
      score: intStructScore,
      max: weights.InternalMarketStructure,
      aligned: hasIntStructure,
      direction,
    });

    // 4. Liquidity Sweep Quality & Recency (Max: weights.LiquiditySweep, default 15)
    let liqScore = 0;
    let liqDetail = "No key liquidity pool swept recently.";
    let liqAligned = false;

    if (sweep && sweep.direction === (isLong ? "BULLISH" : "BEARISH")) {
      liqAligned = true;
      // Recency decay: 0-3 candles = 100%, 4-8 candles = 75%, 9+ candles = 50%
      const recencyFactor =
        sweep.recencyCandles! <= 3 ? 1.0 : sweep.recencyCandles! <= 8 ? 0.75 : 0.5;
      const qualityFactor = sweep.reactionStrength
        ? Math.min(1.2, Math.max(0.7, sweep.reactionStrength))
        : 1.0;
      liqScore = Math.min(
        weights.LiquiditySweep,
        Math.round(weights.LiquiditySweep * recencyFactor * qualityFactor),
      );
      liqDetail = `Swept ${sweep.sweptLevelType} liquidity at $${sweep.sweptLevelPrice.toLocaleString()} with strong rejection (${sweep.recencyCandles ?? 0} candles ago, RVOL: ${sweep.rvol ?? 1.0}x).`;
    } else {
      liqScore = Math.round(weights.LiquiditySweep * 0.2);
    }

    evidence.push({
      label: "Liquidity Sweep",
      detail: liqDetail,
      score: liqScore,
      max: weights.LiquiditySweep,
      aligned: liqAligned,
      direction,
    });

    // 5. Supply / Demand Order Block (Max: weights.SupplyDemandZone, default 10)
    let zoneScore = 0;
    let zoneDetail = "No fresh Order Block in immediate proximity.";
    let zoneAligned = false;

    const expectedZoneType = isLong ? "DEMAND" : "SUPPLY";
    if (zone && zone.type === expectedZoneType && zone.isFresh) {
      zoneAligned = true;
      const rvolBonus = zone.rvol && zone.rvol >= 1.2 ? 1.0 : 0.8;
      zoneScore = Math.round(weights.SupplyDemandZone * rvolBonus);
      zoneDetail = `Price reacted to fresh ${zone.type} Order Block ($${zone.bottomPrice.toLocaleString()} - $${zone.topPrice.toLocaleString()}) with ${zone.rvol ?? 1.0}x displacement.`;
    } else {
      zoneScore = Math.round(weights.SupplyDemandZone * 0.2);
    }

    evidence.push({
      label: "Supply & Demand OB",
      detail: zoneDetail,
      score: zoneScore,
      max: weights.SupplyDemandZone,
      aligned: zoneAligned,
      direction,
    });

    // 6. Fair Value Gap Retest (Max: weights.FVGRetest, default 10)
    let fvgScore = 0;
    let fvgDetail = "No active Fair Value Gap in proximity.";
    let fvgAligned = false;

    const expectedFvgDir = isLong ? "BULLISH" : "BEARISH";
    if (fvg && fvg.direction === expectedFvgDir && fvg.isFresh) {
      fvgAligned = true;
      const fillBonus = fvg.filledPercentage <= 50 ? 1.0 : 0.7;
      fvgScore = Math.round(weights.FVGRetest * fillBonus);
      fvgDetail = `Retesting unmitigated ${fvg.direction} FVG ($${fvg.bottomPrice.toLocaleString()} - $${fvg.topPrice.toLocaleString()}) with ${fvg.filledPercentage}% fill.`;
    } else {
      fvgScore = Math.round(weights.FVGRetest * 0.2);
    }

    evidence.push({
      label: "Fair Value Gap (FVG)",
      detail: fvgDetail,
      score: fvgScore,
      max: weights.FVGRetest,
      aligned: fvgAligned,
      direction,
    });

    // 7. Volume Expansion (Max: weights.VolumeExpansion, default 10)
    let volScore = 0;
    if (rvol >= 1.5) volScore = weights.VolumeExpansion;
    else if (rvol >= 1.2) volScore = Math.round(weights.VolumeExpansion * 0.8);
    else if (rvol >= 0.95) volScore = Math.round(weights.VolumeExpansion * 0.5);
    else volScore = Math.round(weights.VolumeExpansion * 0.2);

    evidence.push({
      label: "Volume Expansion",
      detail:
        rvol >= 1.2
          ? `Supporting institutional volume expansion (RVOL: ${rvol.toFixed(2)}x).`
          : `Consolidation / normal volume levels (RVOL: ${rvol.toFixed(2)}x).`,
      score: volScore,
      max: weights.VolumeExpansion,
      aligned: rvol >= 1.2,
      direction,
    });

    // 8. Momentum Alignment (Max: weights.MomentumAlignment, default 5)
    const momScore = momentumOk
      ? weights.MomentumAlignment
      : Math.round(weights.MomentumAlignment * 0.3);
    evidence.push({
      label: "Momentum Alignment",
      detail: momentumOk
        ? `RSI and MACD momentum stack aligns with ${direction}.`
        : `Lagging or divergent indicator momentum.`,
      score: momScore,
      max: weights.MomentumAlignment,
      aligned: momentumOk,
      direction,
    });

    // 9. Volatility Regime Support (Max: weights.VolatilityRegime, default 5)
    const volRegimeScore = isVolHealthy
      ? weights.VolatilityRegime
      : Math.round(weights.VolatilityRegime * 0.3);
    evidence.push({
      label: "Volatility Regime",
      detail: isVolHealthy
        ? "Volatility parameters sit inside tradeable range."
        : "Extreme or stagnant volatility bounds.",
      score: volRegimeScore,
      max: weights.VolatilityRegime,
      aligned: isVolHealthy,
      direction,
    });

    const totalScore = evidence.reduce((sum, item) => sum + item.score, 0);

    return {
      direction,
      score: Math.min(100, Math.max(0, totalScore)),
      evidence,
    };
  }

  /**
   * Resolves the final trade direction using independent Long vs Short scores,
   * direction threshold, and hard quality gates.
   */
  public static resolveSetup(
    longResult: DirectionalScoreResult,
    shortResult: DirectionalScoreResult,
    stopLossIsValid: boolean,
    stopLossReason: string | undefined,
    isVolHealthy: boolean,
    tp2Rr: number,
    isEntryConfirmed: boolean,
    regime: MarketRegime,
    hasLTFReversal: boolean,
    config: EngineConfig = DEFAULT_CONFIG,
  ): {
    decision: "LONG" | "SHORT" | "NO TRADE";
    confluenceScore: number;
    confidence: "High" | "Moderate" | "Low";
    directionalEdge: number;
    longScore: number;
    shortScore: number;
    rejectionReasons: string[];
    selectedEvidence: EvidenceItem[];
  } {
    const longScore = longResult.score;
    const shortScore = shortResult.score;
    const directionalEdge = Math.abs(longScore - shortScore);

    const minEdge = config.minimumDirectionalEdge ?? DEFAULT_CONFIG.minimumDirectionalEdge;
    const minConfluence =
      config.minimumConfluenceScore ?? config.minimumScore ?? DEFAULT_CONFIG.minimumConfluenceScore;
    const minRR = config.minimumRR ?? DEFAULT_CONFIG.minimumRR;

    const candidateDirection: "LONG" | "SHORT" = longScore >= shortScore ? "LONG" : "SHORT";
    const candidateScore = Math.max(longScore, shortScore);
    const selectedEvidence =
      candidateDirection === "LONG" ? longResult.evidence : shortResult.evidence;

    const rejectionReasons: string[] = [];

    // Quality Gate 1: Directional Edge Threshold
    if (directionalEdge < minEdge) {
      rejectionReasons.push(
        `Directional edge (${directionalEdge} pts) is below required threshold (${minEdge} pts). Long (${longScore}) vs Short (${shortScore}) is in equilibrium.`,
      );
    }

    // Quality Gate 2: Minimum Confluence Score
    if (candidateScore < minConfluence) {
      rejectionReasons.push(
        `Confluence score (${candidateScore}/100) is below minimum required threshold (${minConfluence}/100).`,
      );
    }

    // Quality Gate 3: Structural Stop Loss Validation
    if (!stopLossIsValid) {
      rejectionReasons.push(
        stopLossReason || "Structural stop loss distance is invalid or exceeds risk limit.",
      );
    }

    // Quality Gate 4: Risk / Reward Ratio Threshold
    if (tp2Rr < minRR) {
      rejectionReasons.push(
        `Risk/reward ratio (${tp2Rr.toFixed(2)}R) is below minimum required (${minRR.toFixed(2)}R).`,
      );
    }

    // Quality Gate 5: Market Regime Gate
    const regimeGate = MarketRegimeEngine.evaluateGate(regime, candidateDirection, hasLTFReversal);
    if (!regimeGate.allowed) {
      rejectionReasons.push(regimeGate.reason);
    }

    // Quality Gate 6: Volatility Bounds
    if (!isVolHealthy) {
      rejectionReasons.push(
        "Market volatility is outside healthy bounds (extreme chop or stagnation).",
      );
    }

    // Quality Gate 7: Entry Confirmation
    if (!isEntryConfirmed) {
      rejectionReasons.push(
        "Entry trigger lacks micro-confirmation (rejection wick or RVOL expansion on lower timeframe).",
      );
    }

    // Confidence Level Mapping (Confluence != Probability)
    let confidence: "High" | "Moderate" | "Low" = "Low";
    if (candidateScore >= 75 && directionalEdge >= 18) {
      confidence = "High";
    } else if (candidateScore >= 60 && directionalEdge >= minEdge) {
      confidence = "Moderate";
    }

    const decision: "LONG" | "SHORT" | "NO TRADE" =
      rejectionReasons.length === 0 ? candidateDirection : "NO TRADE";

    return {
      decision,
      confluenceScore: candidateScore,
      confidence,
      directionalEdge,
      longScore,
      shortScore,
      rejectionReasons,
      selectedEvidence,
    };
  }
}
