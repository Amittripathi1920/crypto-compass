import type { Candle } from "../indicators";
import type { MarketRegime, MarketStructure } from "./types";
import { computeIndicators } from "../indicators";

export class MarketRegimeEngine {
  public static classify(
    candles: Candle[],
    ind: ReturnType<typeof computeIndicators>,
    structure: MarketStructure,
  ): MarketRegime {
    const closes = candles.map((c) => c.close);
    const lastPrice = closes[closes.length - 1] ?? 0;

    const isEmaStackBull = ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200;
    const isEmaStackBear = ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200;

    // Volatility checks
    const atrPct = ind.atrPct;
    const isHighVolatility = atrPct > 3.2;
    const isLowVolatility = atrPct < 0.6;

    // Swing structure bias
    let hhCount = 0;
    let lhCount = 0;
    let hlCount = 0;
    let llCount = 0;

    const swings = structure.swings.slice(-8);
    for (let i = 2; i < swings.length; i++) {
      const prev = swings[i - 2]!;
      const curr = swings[i]!;
      if (curr.type === "high" && prev.type === "high") {
        if (curr.price > prev.price) hhCount++;
        else lhCount++;
      }
      if (curr.type === "low" && prev.type === "low") {
        if (curr.price > prev.price) hlCount++;
        else llCount++;
      }
    }

    const isBullishStructure = hhCount >= 1 && hlCount >= 1 && llCount === 0;
    const isBearishStructure = lhCount >= 1 && llCount >= 1 && hhCount === 0;

    // Check for breakout
    const lastSwingHigh = structure.swings.filter((s) => s.type === "high").pop();
    const lastSwingLow = structure.swings.filter((s) => s.type === "low").pop();

    const isBullishBreakout = !!lastSwingHigh && lastPrice > lastSwingHigh.price;
    const isBearishBreakout = !!lastSwingLow && lastPrice < lastSwingLow.price;

    if (isEmaStackBull && isBullishStructure) {
      return "STRONG_BULLISH";
    }
    if (isEmaStackBear && isBearishStructure) {
      return "STRONG_BEARISH";
    }
    if (isBullishBreakout || isBearishBreakout) {
      return "BREAKOUT";
    }
    if (isEmaStackBull || isBullishStructure) {
      return "BULLISH";
    }
    if (isEmaStackBear || isBearishStructure) {
      return "BEARISH";
    }
    if (isHighVolatility) {
      return "HIGH_VOLATILITY";
    }
    if (isLowVolatility) {
      return "LOW_VOLATILITY";
    }

    if (ind.trend === "short-term bullish") {
      return "WEAK_BULLISH";
    }
    if (ind.trend === "short-term bearish") {
      return "WEAK_BEARISH";
    }

    return "RANGING";
  }

  /**
   * Evaluates if the market regime allows the proposed trade direction.
   * Regimes act as a structural gate rather than just a score.
   */
  public static evaluateGate(
    regime: MarketRegime,
    direction: "LONG" | "SHORT",
    hasInternalReversal: boolean,
  ): { allowed: boolean; penalty: number; reason: string } {
    if (direction === "LONG") {
      if (regime === "STRONG_BEARISH" && !hasInternalReversal) {
        return {
          allowed: false,
          penalty: 15,
          reason:
            "Cannot take long trades directly into a STRONG_BEARISH trend without confirmed LTF reversal (internal CHoCH).",
        };
      }
      if (regime === "BEARISH" && !hasInternalReversal) {
        return {
          allowed: true,
          penalty: 8,
          reason: "Bearish higher-timeframe regime creates headwind for long setups.",
        };
      }
      if (regime === "STRONG_BULLISH" || regime === "BULLISH") {
        return {
          allowed: true,
          penalty: 0,
          reason: "Bullish higher-timeframe regime strongly supports long positions.",
        };
      }
    } else {
      if (regime === "STRONG_BULLISH" && !hasInternalReversal) {
        return {
          allowed: false,
          penalty: 15,
          reason:
            "Cannot take short trades directly into a STRONG_BULLISH trend without confirmed LTF reversal (internal CHoCH).",
        };
      }
      if (regime === "BULLISH" && !hasInternalReversal) {
        return {
          allowed: true,
          penalty: 8,
          reason: "Bullish higher-timeframe regime creates headwind for short setups.",
        };
      }
      if (regime === "STRONG_BEARISH" || regime === "BEARISH") {
        return {
          allowed: true,
          penalty: 0,
          reason: "Bearish higher-timeframe regime strongly supports short positions.",
        };
      }
    }

    if (regime === "HIGH_VOLATILITY") {
      return {
        allowed: true,
        penalty: 3,
        reason: "High volatility regime requires wider ATR buffers and strict risk bounds.",
      };
    }

    if (regime === "LOW_VOLATILITY") {
      return {
        allowed: true,
        penalty: 3,
        reason: "Low volatility regime indicates compression; wait for range expansion.",
      };
    }

    return {
      allowed: true,
      penalty: 0,
      reason: "Regime is balanced/ranging; directional bias depends on boundary sweep.",
    };
  }
}
