import type { EngineConfig, LiquiditySweep, Zone, FVG, Confirmation } from "./types";

export class ConfluenceEngine {
  public static evaluate(
    direction: "LONG" | "SHORT",
    htfTrendMatch: boolean,
    hasBOSorCHoCH: boolean,
    sweep: LiquiditySweep | null,
    zone: Zone | null,
    fvg: FVG | null,
    rvol: number,
    momentumOk: boolean,
    isVolHealthy: boolean,
    rrRatio: number,
    slIsValid: boolean,
    config: EngineConfig
  ) {
    const reasons: { label: string; detail: string; score: number; max: number }[] = [];
    
    // 1. HTF Trend Alignment (Max 20)
    const htfScore = htfTrendMatch ? 20 : 5;
    reasons.push({
      label: "HTF Alignment",
      detail: htfTrendMatch 
        ? "Setup matches the higher timeframe directional bias." 
        : "Conflicting or neutral higher timeframe trend.",
      score: htfScore,
      max: 20
    });

    // 2. Market Structure (Max 20)
    const structScore = hasBOSorCHoCH ? 20 : 8;
    reasons.push({
      label: "Market Structure",
      detail: hasBOSorCHoCH
        ? `Confirmed swing breakout (BOS/CHoCH) supports the setup.`
        : "Sideways or consolidated range structure.",
      score: structScore,
      max: 20
    });

    // 3. Liquidity (Max 15)
    let liqScore = 0;
    let liqDetail = "No key liquidity pool swept recently.";
    if (sweep && sweep.direction === (direction === "LONG" ? "BULLISH" : "BEARISH")) {
      liqScore = 15;
      liqDetail = `Swept ${sweep.sweptLevelType} liquidity at $${sweep.sweptLevelPrice.toLocaleString()} followed by rejection.`;
    } else {
      liqScore = 5;
    }
    reasons.push({
      label: "Liquidity",
      detail: liqDetail,
      score: liqScore,
      max: 15
    });

    // 4. Supply/Demand Zones (Max 10)
    let zoneScore = 0;
    let zoneDetail = "No fresh order block or FVG in proximity.";
    if (zone && zone.isFresh) {
      zoneScore = 10;
      zoneDetail = `Price reacted to a fresh ${zone.type} zone at $${zone.bottomPrice.toLocaleString()}-$${zone.topPrice.toLocaleString()}.`;
    } else if (fvg) {
      zoneScore = 8;
      zoneDetail = `Retesting fresh ${fvg.direction} Fair Value Gap (FVG) at $${fvg.bottomPrice.toLocaleString()}-$${fvg.topPrice.toLocaleString()}.`;
    } else {
      zoneScore = 3;
    }
    reasons.push({
      label: "Supply & Demand",
      detail: zoneDetail,
      score: zoneScore,
      max: 10
    });

    // 5. Volume (Max 10)
    const volScore = rvol >= 1.5 ? 10 : rvol >= 1.2 ? 8 : rvol >= 0.9 ? 5 : 2;
    reasons.push({
      label: "Volume",
      detail: rvol >= 1.25 
        ? `Supporting volume expansion detected (RVOL: ${rvol.toFixed(2)}x).` 
        : `Consolidation volume levels (RVOL: ${rvol.toFixed(2)}x).`,
      score: volScore,
      max: 10
    });

    // 6. Momentum (Max 10)
    const momScore = momentumOk ? 10 : 4;
    reasons.push({
      label: "Momentum",
      detail: momentumOk 
        ? "MACD and RSI indicator confluences align with direction."
        : "Neutral or lagging indicator momentum.",
      score: momScore,
      max: 10
    });

    // 7. Entry Confirmation (Max 10)
    // Checked if there is a sweep or a clean rejection wick on the lower timeframe
    const entryConfScore = sweep ? 10 : 5;
    reasons.push({
      label: "Entry Confirmation",
      detail: sweep 
        ? "Micro-structure sweep provides entry invalidation line."
        : "Generic entry without dedicated wick sweep.",
      score: entryConfScore,
      max: 10
    });

    // 8. Volatility (Max 5)
    const volStatsScore = isVolHealthy ? 5 : 2;
    reasons.push({
      label: "Volatility",
      detail: isVolHealthy 
        ? "Volatility parameters sit inside tradeable range."
        : "Extreme or stagnant volatility bounds.",
      score: volStatsScore,
      max: 5
    });

    // Calculate separate Setup and Entry Scores
    // Setup measures context: HTF + Structure + Liquidity + S/D
    const setupScore = Math.round(((htfScore + structScore + liqScore + zoneScore) / 65) * 100);
    // Entry measures trigger: Volume + Momentum + Entry Confirmation + Volatility
    const entryScore = Math.round(((volScore + momScore + entryConfScore + volStatsScore) / 35) * 100);
    
    const finalScore = Math.round((setupScore * 0.6) + (entryScore * 0.4));

    // Hard Filters
    const rejectionReasons: string[] = [];
    if (!slIsValid) {
      rejectionReasons.push("Stop loss is excessively wide or invalid");
    }
    if (!isVolHealthy) {
      rejectionReasons.push("Market volatility is outside healthy bounds");
    }
    if (rrRatio < config.minimumRR) {
      rejectionReasons.push(`Risk/reward ratio (${rrRatio.toFixed(2)}R) is below minimum required (${config.minimumRR}R)`);
    }
    if (setupScore < config.minimumSetupScore) {
      rejectionReasons.push(`Setup score (${setupScore}/100) is below threshold (${config.minimumSetupScore})`);
    }
    if (entryScore < config.minimumEntryScore) {
      rejectionReasons.push(`Entry score (${entryScore}/100) is below threshold (${config.minimumEntryScore})`);
    }
    if (finalScore < config.minimumScore) {
      rejectionReasons.push(`Overall confluence score (${finalScore}/100) is below threshold (${config.minimumScore})`);
    }

    const decision: "LONG" | "SHORT" | "NO TRADE" = rejectionReasons.length === 0 ? direction : "NO TRADE";

    return {
      decision,
      setupScore,
      entryScore,
      finalScore,
      reasons: reasons.map(r => ({ label: r.label, detail: `${r.detail} (+${r.score}/${r.max} pts)` })),
      rejectionReasons
    };
  }
}
