import type { Candle } from "../indicators";
import type { Zone, FVG, SwingPoint } from "./types";

export class ZoneEngine {
  public static detectZones(
    candles: Candle[],
    swings: SwingPoint[],
    atrVal: number
  ): Zone[] {
    const zones: Zone[] = [];
    const lastPrice = candles[candles.length - 1]?.close ?? 0;
    
    // Scan candles to find Order Blocks / Supply-Demand zones
    // We look for a candle followed by a "displacement" candle (large body + volume spike)
    for (let i = 1; i < candles.length - 2; i++) {
      const c0 = candles[i - 1]!; // The potential OB base candle
      const c1 = candles[i]!;     // The displacement candle
      const c2 = candles[i + 1]!; // Follow through candle
      
      const body1 = Math.abs(c1.close - c1.open);
      const isBullDisplacement = c1.close > c1.open && body1 > atrVal * 1.3 && c1.volume > 0;
      const isBearDisplacement = c1.close < c1.open && body1 > atrVal * 1.3 && c1.volume > 0;
      
      if (isBullDisplacement) {
        // Demand Zone: Base is the previous down candle c0
        if (c0.close < c0.open) {
          zones.push({
            id: `demand_${c0.time}`,
            type: "DEMAND",
            topPrice: Math.max(c0.open, c0.close),
            bottomPrice: c0.low,
            time: c0.time,
            isFresh: true,
            testCount: 0,
            volumeConfirm: Number((c1.volume / (c0.volume || 1)).toFixed(2))
          });
        }
      } else if (isBearDisplacement) {
        // Supply Zone: Base is the previous up candle c0
        if (c0.close > c0.open) {
          zones.push({
            id: `supply_${c0.time}`,
            type: "SUPPLY",
            topPrice: c0.high,
            bottomPrice: Math.min(c0.open, c0.close),
            time: c0.time,
            isFresh: true,
            testCount: 0,
            volumeConfirm: Number((c1.volume / (c0.volume || 1)).toFixed(2))
          });
        }
      }
    }

    // Update freshness and test count based on subsequent candles
    zones.forEach((z) => {
      const postCandles = candles.filter((c) => c.time > z.time);
      let tests = 0;
      let invalidated = false;

      for (const c of postCandles) {
        if (z.type === "DEMAND") {
          // Check if candle close invalidates the zone
          if (c.close < z.bottomPrice) {
            invalidated = true;
            break;
          }
          // Check if price wicks into the zone
          if (c.low <= z.topPrice && c.high >= z.bottomPrice) {
            tests++;
          }
        } else {
          // Check if candle close invalidates the zone
          if (c.close > z.topPrice) {
            invalidated = true;
            break;
          }
          // Check if price wicks into the zone
          if (c.high >= z.bottomPrice && c.low <= z.topPrice) {
            tests++;
          }
        }
      }

      z.isFresh = !invalidated && tests === 0;
      z.testCount = tests;
    });

    // Filter out invalidated zones and return the most relevant ones
    return zones.filter((z) => {
      const postCandles = candles.filter((c) => c.time > z.time);
      const isStillActive = z.type === "DEMAND" 
        ? !postCandles.some((c) => c.close < z.bottomPrice)
        : !postCandles.some((c) => c.close > z.topPrice);
      return isStillActive;
    });
  }

  public static detectFVGs(candles: Candle[]): FVG[] {
    const fvgs: FVG[] = [];
    if (candles.length < 3) return fvgs;

    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2]!;
      const c2 = candles[i - 1]!;
      const c3 = candles[i]!;

      // Bullish FVG: Low of candle 3 is higher than High of candle 1
      if (c3.low > c1.high && c2.close > c2.open) {
        fvgs.push({
          direction: "BULLISH",
          topPrice: c3.low,
          bottomPrice: c1.high,
          time: c2.time,
          size: c3.low - c1.high,
          filledPercentage: 0,
          isFresh: true
        });
      }
      // Bearish FVG: High of candle 3 is lower than Low of candle 1
      else if (c3.high < c1.low && c2.close < c2.open) {
        fvgs.push({
          direction: "BEARISH",
          topPrice: c1.low,
          bottomPrice: c3.high,
          time: c2.time,
          size: c1.low - c3.high,
          filledPercentage: 0,
          isFresh: true
        });
      }
    }

    // Calculate filled status based on post price action
    fvgs.forEach((f) => {
      const postCandles = candles.filter((c) => c.time > f.time);
      let maxReach = f.direction === "BULLISH" ? Infinity : -Infinity;

      for (const c of postCandles) {
        if (f.direction === "BULLISH") {
          maxReach = Math.min(maxReach, c.low);
          if (c.close < f.bottomPrice) {
            f.isFresh = false;
            f.filledPercentage = 100;
            break;
          }
        } else {
          maxReach = Math.max(maxReach, c.high);
          if (c.close > f.topPrice) {
            f.isFresh = false;
            f.filledPercentage = 100;
            break;
          }
        }
      }

      if (f.isFresh) {
        const totalRange = f.topPrice - f.bottomPrice;
        if (f.direction === "BULLISH") {
          if (maxReach < f.topPrice) {
            const filled = f.topPrice - maxReach;
            f.filledPercentage = Math.min(100, Math.max(0, Number(((filled / totalRange) * 100).toFixed(1))));
          }
        } else {
          if (maxReach > f.bottomPrice) {
            const filled = maxReach - f.bottomPrice;
            f.filledPercentage = Math.min(100, Math.max(0, Number(((filled / totalRange) * 100).toFixed(1))));
          }
        }
        if (f.filledPercentage >= 95) {
          f.isFresh = false;
        }
      }
    });

    return fvgs.filter((f) => f.isFresh);
  }
}
