import type { Candle } from "../indicators";
import type { Zone, FVG, SwingPoint } from "./types";
import { sma } from "../indicators";

export class ZoneEngine {
  public static detectZones(candles: Candle[], swings: SwingPoint[], atrVal: number): Zone[] {
    const zones: Zone[] = [];
    if (candles.length < 5) return zones;

    const volumes = candles.map((c) => c.volume);
    const avgVol = sma(volumes.slice(-40), 20) || 1;

    // Scan candles to find institutional Order Blocks (OBs)
    // Structure: c0 (base candle) -> c1 (displacement candle with high volume + body > 1.2 ATR)
    for (let i = 1; i < candles.length - 2; i++) {
      const c0 = candles[i - 1]!; // The OB base candle
      const c1 = candles[i]!; // The displacement candle

      const body1 = Math.abs(c1.close - c1.open);
      const range1 = Math.max(c1.high - c1.low, atrVal * 0.1);
      const rvol1 = c1.volume / (avgVol || 1);

      // Displacement criteria:
      // 1. Large candle body > 1.2 * ATR
      // 2. High relative volume (RVOL >= 1.2)
      // 3. Strong close near extreme
      const isBullDisplacement =
        c1.close > c1.open &&
        body1 >= atrVal * 1.15 &&
        rvol1 >= 1.15 &&
        (c1.close - c1.low) / range1 >= 0.7;

      const isBearDisplacement =
        c1.close < c1.open &&
        body1 >= atrVal * 1.15 &&
        rvol1 >= 1.15 &&
        (c1.high - c1.close) / range1 >= 0.7;

      if (isBullDisplacement) {
        // Demand Zone: Base is the previous down candle c0
        if (c0.close <= c0.open) {
          zones.push({
            id: `demand_${c0.time}`,
            type: "DEMAND",
            topPrice: Math.max(c0.open, c0.close),
            bottomPrice: c0.low,
            time: c0.time,
            isFresh: true,
            testCount: 0,
            volumeConfirm: Number(rvol1.toFixed(2)),
            rvol: Number(rvol1.toFixed(2)),
            displacementStrength: Number((body1 / atrVal).toFixed(2)),
            mitigationPct: 0,
          });
        }
      } else if (isBearDisplacement) {
        // Supply Zone: Base is the previous up candle c0
        if (c0.close >= c0.open) {
          zones.push({
            id: `supply_${c0.time}`,
            type: "SUPPLY",
            topPrice: c0.high,
            bottomPrice: Math.min(c0.open, c0.close),
            time: c0.time,
            isFresh: true,
            testCount: 0,
            volumeConfirm: Number(rvol1.toFixed(2)),
            rvol: Number(rvol1.toFixed(2)),
            displacementStrength: Number((body1 / atrVal).toFixed(2)),
            mitigationPct: 0,
          });
        }
      }
    }

    // Update freshness, test count, and mitigation status
    zones.forEach((z) => {
      const postCandles = candles.filter((c) => c.time > z.time);
      let tests = 0;
      let invalidated = false;
      let deepestPenetration = 0;
      const zoneHeight = Math.max(z.topPrice - z.bottomPrice, 0.0001);

      for (const c of postCandles) {
        if (z.type === "DEMAND") {
          // Demand invalidation: candle close below zone bottom
          if (c.close < z.bottomPrice) {
            invalidated = true;
            deepestPenetration = zoneHeight;
            break;
          }
          // Test of demand zone
          if (c.low <= z.topPrice && c.high >= z.bottomPrice) {
            tests++;
            const penetration = z.topPrice - Math.max(c.low, z.bottomPrice);
            deepestPenetration = Math.max(deepestPenetration, penetration);
          }
        } else {
          // Supply invalidation: candle close above zone top
          if (c.close > z.topPrice) {
            invalidated = true;
            deepestPenetration = zoneHeight;
            break;
          }
          // Test of supply zone
          if (c.high >= z.bottomPrice && c.low <= z.topPrice) {
            tests++;
            const penetration = Math.min(c.high, z.topPrice) - z.bottomPrice;
            deepestPenetration = Math.max(deepestPenetration, penetration);
          }
        }
      }

      z.testCount = tests;
      z.mitigationPct = Math.min(100, Math.round((deepestPenetration / zoneHeight) * 100));
      z.isFresh = !invalidated && tests <= 1 && z.mitigationPct <= 50;
    });

    // Return active and non-invalidated zones, most recent first
    return zones
      .filter((z) => {
        const postCandles = candles.filter((c) => c.time > z.time);
        return z.type === "DEMAND"
          ? !postCandles.some((c) => c.close < z.bottomPrice)
          : !postCandles.some((c) => c.close > z.topPrice);
      })
      .slice(-10);
  }

  public static detectFVGs(candles: Candle[], atrVal = 0): FVG[] {
    const fvgs: FVG[] = [];
    if (candles.length < 3) return fvgs;

    const volumes = candles.map((c) => c.volume);
    const avgVol = sma(volumes.slice(-40), 20) || 1;

    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2]!;
      const c2 = candles[i - 1]!;
      const c3 = candles[i]!;

      const body2 = Math.abs(c2.close - c2.open);
      const rvol2 = c2.volume / (avgVol || 1);

      // Bullish FVG: Low of candle 3 is higher than High of candle 1
      if (c3.low > c1.high && c2.close > c2.open) {
        const gapSize = c3.low - c1.high;
        const sizeRatio = atrVal > 0 ? gapSize / atrVal : 1;

        // Require gap to be meaningful (at least 0.20 ATR if ATR provided)
        if (atrVal === 0 || sizeRatio >= 0.2) {
          fvgs.push({
            direction: "BULLISH",
            topPrice: c3.low,
            bottomPrice: c1.high,
            time: c2.time,
            size: gapSize,
            sizeRatioToAtr: Number(sizeRatio.toFixed(2)),
            filledPercentage: 0,
            isFresh: true,
            rvol: Number(rvol2.toFixed(2)),
            displacementStrength: atrVal > 0 ? Number((body2 / atrVal).toFixed(2)) : 1,
          });
        }
      }
      // Bearish FVG: High of candle 3 is lower than Low of candle 1
      else if (c3.high < c1.low && c2.close < c2.open) {
        const gapSize = c1.low - c3.high;
        const sizeRatio = atrVal > 0 ? gapSize / atrVal : 1;

        if (atrVal === 0 || sizeRatio >= 0.2) {
          fvgs.push({
            direction: "BEARISH",
            topPrice: c1.low,
            bottomPrice: c3.high,
            time: c2.time,
            size: gapSize,
            sizeRatioToAtr: Number(sizeRatio.toFixed(2)),
            filledPercentage: 0,
            isFresh: true,
            rvol: Number(rvol2.toFixed(2)),
            displacementStrength: atrVal > 0 ? Number((body2 / atrVal).toFixed(2)) : 1,
          });
        }
      }
    }

    // Calculate filled percentage and freshness based on post price action
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
            f.filledPercentage = Math.min(
              100,
              Math.max(0, Number(((filled / totalRange) * 100).toFixed(1))),
            );
          }
        } else {
          if (maxReach > f.bottomPrice) {
            const filled = maxReach - f.bottomPrice;
            f.filledPercentage = Math.min(
              100,
              Math.max(0, Number(((filled / totalRange) * 100).toFixed(1))),
            );
          }
        }
        if (f.filledPercentage >= 85) {
          f.isFresh = false;
        }
      }
    });

    return fvgs.filter((f) => f.isFresh);
  }
}
