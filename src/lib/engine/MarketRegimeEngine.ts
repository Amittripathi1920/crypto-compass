import type { Candle } from "../indicators";
import type { MarketRegime, MarketStructure } from "./types";
import { computeIndicators } from "../indicators";

export class MarketRegimeEngine {
  public static classify(
    candles: Candle[],
    ind: ReturnType<typeof computeIndicators>,
    structure: MarketStructure
  ): MarketRegime {
    const closes = candles.map((c) => c.close);
    const lastPrice = closes[closes.length - 1] ?? 0;
    
    const isEmaStackBull = ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200;
    const isEmaStackBear = ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200;
    
    // Volatility checks
    const atrPct = ind.atrPct;
    const isHighVolatility = atrPct > 2.5;
    const isLowVolatility = atrPct < 0.8;
    
    // Swing structure bias
    let hhCount = 0;
    let lhCount = 0;
    let hlCount = 0;
    let llCount = 0;
    
    const swings = structure.swings.slice(-6);
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
    
    const isBullishStructure = hhCount >= 1 && hlCount >= 1;
    const isBearishStructure = lhCount >= 1 && llCount >= 1;
    
    // Check if there is a breakout recently (closing above/below last swing high/low)
    const lastSwingHigh = structure.swings.filter((s) => s.type === "high").pop();
    const lastSwingLow = structure.swings.filter((s) => s.type === "low").pop();
    
    const isBullishBreakout = lastSwingHigh && lastPrice > lastSwingHigh.price;
    const isBearishBreakout = lastSwingLow && lastPrice < lastSwingLow.price;
    
    // Decision matrix using weighted confluence
    if (isEmaStackBull && isBullishStructure) {
      return "STRONG_BULLISH";
    }
    if (isEmaStackBear && isBearishStructure) {
      return "STRONG_BEARISH";
    }
    if (isBullishBreakout) {
      return "BREAKOUT";
    }
    if (isBearishBreakout) {
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
    
    // Fallbacks
    if (ind.trend === "short-term bullish") {
      return "WEAK_BULLISH";
    }
    if (ind.trend === "short-term bearish") {
      return "WEAK_BEARISH";
    }
    
    return "RANGING";
  }
}
