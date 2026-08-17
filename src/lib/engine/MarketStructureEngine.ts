import type { Candle } from "../indicators";
import type { MarketStructure, SwingPoint, BOS, CHoCH } from "./types";

export class MarketStructureEngine {
  /**
   * Detects swing points, BOS, and CHoCH for a given candle array and pivot strength.
   */
  public static detect(candles: Candle[], pivotStrength = 4, isExternal = true): MarketStructure {
    const swings: SwingPoint[] = [];
    const bos: BOS[] = [];
    const choch: CHoCH[] = [];

    if (candles.length < pivotStrength * 2 + 1) {
      return {
        swings,
        bos,
        choch,
        externalBos: [],
        externalChoch: [],
        internalBos: [],
        internalChoch: [],
      };
    }

    // 1. Detect Swing Highs and Lows
    for (let i = pivotStrength; i < candles.length - pivotStrength; i++) {
      const c = candles[i]!;
      const leftSlice = candles.slice(i - pivotStrength, i);
      const rightSlice = candles.slice(i + 1, i + pivotStrength + 1);

      const leftHighs = leftSlice.map((x) => x.high);
      const rightHighs = rightSlice.map((x) => x.high);
      const leftLows = leftSlice.map((x) => x.low);
      const rightLows = rightSlice.map((x) => x.low);

      const isHigh = c.high >= Math.max(...leftHighs) && c.high > Math.max(...rightHighs);
      const isLow = c.low <= Math.min(...leftLows) && c.low < Math.min(...rightLows);

      if (isHigh) {
        swings.push({
          index: i,
          price: c.high,
          type: "high",
          time: c.time,
          strength: pivotStrength,
          isExternal,
        });
      } else if (isLow) {
        swings.push({
          index: i,
          price: c.low,
          type: "low",
          time: c.time,
          strength: pivotStrength,
          isExternal,
        });
      }
    }

    // 2. Detect BOS and CHoCH sequentially
    let lastHigh: SwingPoint | null = null;
    let lastLow: SwingPoint | null = null;
    let trendDirection: "BULL" | "BEAR" | "NEUTRAL" = "NEUTRAL";

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i]!;

      // Known swings up to index i
      const activeSwings = swings.filter((s) => s.index + pivotStrength <= i);
      const currentHigh = activeSwings.filter((s) => s.type === "high").pop() || null;
      const currentLow = activeSwings.filter((s) => s.type === "low").pop() || null;

      if (currentHigh && (!lastHigh || currentHigh.index !== lastHigh.index)) {
        lastHigh = currentHigh;
      }
      if (currentLow && (!lastLow || currentLow.index !== lastLow.index)) {
        lastLow = currentLow;
      }

      // Check for breaks
      if (lastHigh && c.close > lastHigh.price) {
        if (trendDirection === "BEAR") {
          // Trend reversal: CHoCH
          choch.push({
            type: "CHOCH_BULL",
            price: lastHigh.price,
            time: c.time,
            sourceSwingIndex: lastHigh.index,
            strength: lastHigh.strength,
            isExternal,
          });
          trendDirection = "BULL";
        } else {
          // Trend continuation: BOS
          bos.push({
            type: "BOS_BULL",
            price: lastHigh.price,
            time: c.time,
            sourceSwingIndex: lastHigh.index,
            strength: lastHigh.strength,
            isExternal,
          });
          trendDirection = "BULL";
        }
        lastHigh = null;
      }

      if (lastLow && c.close < lastLow.price) {
        if (trendDirection === "BULL") {
          // Trend reversal: CHoCH
          choch.push({
            type: "CHOCH_BEAR",
            price: lastLow.price,
            time: c.time,
            sourceSwingIndex: lastLow.index,
            strength: lastLow.strength,
            isExternal,
          });
          trendDirection = "BEAR";
        } else {
          // Trend continuation: BOS
          bos.push({
            type: "BOS_BEAR",
            price: lastLow.price,
            time: c.time,
            sourceSwingIndex: lastLow.index,
            strength: lastLow.strength,
            isExternal,
          });
          trendDirection = "BEAR";
        }
        lastLow = null;
      }
    }

    return {
      swings,
      bos,
      choch,
      externalBos: isExternal ? bos : [],
      externalChoch: isExternal ? choch : [],
      internalBos: !isExternal ? bos : [],
      internalChoch: !isExternal ? choch : [],
    };
  }

  /**
   * Dual detection: captures both External structure (macro swings) and Internal structure (minor pullback breaks).
   */
  public static detectDual(
    candles: Candle[],
    externalPivot = 4,
    internalPivot = 2,
  ): MarketStructure {
    const external = this.detect(candles, externalPivot, true);
    const internal = this.detect(candles, internalPivot, false);

    // Merge swings and sort by time
    const allSwings = [...external.swings, ...internal.swings].sort((a, b) => a.time - b.time);
    // Deduplicate any overlapping swing indices
    const uniqueSwings: SwingPoint[] = [];
    const seenIndices = new Set<number>();
    for (const s of allSwings) {
      if (!seenIndices.has(s.index)) {
        seenIndices.add(s.index);
        uniqueSwings.push(s);
      }
    }

    return {
      swings: uniqueSwings,
      bos: [...external.bos, ...internal.bos],
      choch: [...external.choch, ...internal.choch],
      externalBos: external.bos,
      externalChoch: external.choch,
      internalBos: internal.bos,
      internalChoch: internal.choch,
    };
  }
}
