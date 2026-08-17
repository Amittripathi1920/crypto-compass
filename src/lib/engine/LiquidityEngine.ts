import type { Candle } from "../indicators";
import type { LiquidityLevel, LiquiditySweep, SwingPoint } from "./types";
import { sma } from "../indicators";

export class LiquidityEngine {
  public static mapLiquidity(
    candles: Candle[],
    dailyCandles: Candle[],
    swings: SwingPoint[],
    atrVal: number,
  ): LiquidityLevel[] {
    const levels: LiquidityLevel[] = [];
    const lastIdx = candles.length - 1;
    const lastPrice = candles[lastIdx]?.close ?? 0;

    // 1. Previous Day High & Low (from daily candles)
    if (dailyCandles.length >= 2) {
      const prevDay = dailyCandles[dailyCandles.length - 2]!;
      levels.push({
        id: `pdh_${prevDay.time}`,
        type: "PDH",
        price: prevDay.high,
        strength: 20,
        isSwept: false,
        time: prevDay.time,
        distancePct: lastPrice > 0 ? (Math.abs(lastPrice - prevDay.high) / lastPrice) * 100 : 0,
      });
      levels.push({
        id: `pdl_${prevDay.time}`,
        type: "PDL",
        price: prevDay.low,
        strength: 20,
        isSwept: false,
        time: prevDay.time,
        distancePct: lastPrice > 0 ? (Math.abs(lastPrice - prevDay.low) / lastPrice) * 100 : 0,
      });
    }

    // 2. Previous Week High & Low (from last 7 daily candles)
    if (dailyCandles.length >= 8) {
      const prevWeekCandles = dailyCandles.slice(-8, -1);
      const pwh = Math.max(...prevWeekCandles.map((c) => c.high));
      const pwl = Math.min(...prevWeekCandles.map((c) => c.low));
      levels.push({
        id: `pwh_${dailyCandles[dailyCandles.length - 2]!.time}`,
        type: "PWH",
        price: pwh,
        strength: 25,
        isSwept: false,
        time: dailyCandles[dailyCandles.length - 2]!.time,
        distancePct: lastPrice > 0 ? (Math.abs(lastPrice - pwh) / lastPrice) * 100 : 0,
      });
      levels.push({
        id: `pwl_${dailyCandles[dailyCandles.length - 2]!.time}`,
        type: "PWL",
        price: pwl,
        strength: 25,
        isSwept: false,
        time: dailyCandles[dailyCandles.length - 2]!.time,
        distancePct: lastPrice > 0 ? (Math.abs(lastPrice - pwl) / lastPrice) * 100 : 0,
      });
    }

    // 3. Swing Highs & Lows
    const recentHighs = swings.filter((s) => s.type === "high").slice(-6);
    const recentLows = swings.filter((s) => s.type === "low").slice(-6);

    recentHighs.forEach((h) => {
      levels.push({
        id: `sh_${h.index}`,
        type: "SWING_HIGH",
        price: h.price,
        strength: h.isExternal ? 20 : 12,
        isSwept: false,
        time: h.time,
        distancePct: lastPrice > 0 ? (Math.abs(lastPrice - h.price) / lastPrice) * 100 : 0,
      });
    });

    recentLows.forEach((l) => {
      levels.push({
        id: `sl_${l.index}`,
        type: "SWING_LOW",
        price: l.price,
        strength: l.isExternal ? 20 : 12,
        isSwept: false,
        time: l.time,
        distancePct: lastPrice > 0 ? (Math.abs(lastPrice - l.price) / lastPrice) * 100 : 0,
      });
    });

    // 4. Equal Highs & Equal Lows (EQH / EQL) within 0.18% threshold
    const threshold = 0.0018;

    for (let i = 0; i < recentHighs.length; i++) {
      for (let j = i + 1; j < recentHighs.length; j++) {
        const h1 = recentHighs[i]!;
        const h2 = recentHighs[j]!;
        if (Math.abs(h1.price - h2.price) / h1.price <= threshold) {
          const avgPrice = (h1.price + h2.price) / 2;
          levels.push({
            id: `eqh_${h1.index}_${h2.index}`,
            type: "EQH",
            price: avgPrice,
            strength: 22,
            isSwept: false,
            time: Math.max(h1.time, h2.time),
            distancePct: lastPrice > 0 ? (Math.abs(lastPrice - avgPrice) / lastPrice) * 100 : 0,
          });
        }
      }
    }

    for (let i = 0; i < recentLows.length; i++) {
      for (let j = i + 1; j < recentLows.length; j++) {
        const l1 = recentLows[i]!;
        const l2 = recentLows[j]!;
        if (Math.abs(l1.price - l2.price) / l1.price <= threshold) {
          const avgPrice = (l1.price + l2.price) / 2;
          levels.push({
            id: `eql_${l1.index}_${l2.index}`,
            type: "EQL",
            price: avgPrice,
            strength: 22,
            isSwept: false,
            time: Math.max(l1.time, l2.time),
            distancePct: lastPrice > 0 ? (Math.abs(lastPrice - avgPrice) / lastPrice) * 100 : 0,
          });
        }
      }
    }

    // Mark swept levels
    levels.forEach((lvl) => {
      const postCandles = candles.filter((c) => c.time > lvl.time);
      const isHighLvl = ["PDH", "PWH", "EQH", "SWING_HIGH"].includes(lvl.type);

      const swept = postCandles.some((c) => {
        return isHighLvl ? c.high > lvl.price : c.low < lvl.price;
      });

      lvl.isSwept = swept;
    });

    return levels;
  }

  /**
   * Detects liquidity sweeps from the recent candles (scanning last 15 candles for recency).
   */
  public static detectSweep(
    candles: Candle[],
    levels: LiquidityLevel[],
    atrVal: number,
  ): LiquiditySweep | null {
    if (candles.length < 5) return null;

    const volumes = candles.map((c) => c.volume);
    const avgVol = sma(volumes.slice(-30), 20) || 1;

    // Scan backwards from most recent candle (last 12 candles max)
    const scanWindow = Math.min(12, candles.length);
    const recentCandles = candles.slice(-scanWindow);

    for (let offset = recentCandles.length - 1; offset >= 0; offset--) {
      const c = recentCandles[offset]!;
      const recencyCandles = recentCandles.length - 1 - offset; // 0 = current candle, 1 = 1 candle ago...

      // Check against all liquidity levels created before this candle
      const relevantLevels = levels.filter((l) => l.time < c.time);

      for (const lvl of relevantLevels) {
        const isHighLvl = ["PDH", "PWH", "EQH", "SWING_HIGH"].includes(lvl.type);
        const candleRange = Math.max(c.high - c.low, atrVal * 0.1);
        const candleRvol = c.volume / avgVol;

        if (isHighLvl) {
          // Bearish Sweep: price traded above resistance, but closed below it
          if (c.high > lvl.price && c.close < lvl.price) {
            const upperWick = c.high - Math.max(c.open, c.close);
            const bodySize = Math.abs(c.close - c.open);
            const closeLocationRatio = (c.close - c.low) / candleRange; // 0 = closed at low, 1 = closed at high

            // Significant rejection wick: wick >= 0.2 * ATR, wick > body * 0.7, close in lower 60% of candle
            if (
              upperWick >= atrVal * 0.2 &&
              upperWick >= bodySize * 0.6 &&
              closeLocationRatio <= 0.65
            ) {
              const reactionStrength = Number((upperWick / candleRange).toFixed(2));
              return {
                direction: "BEARISH",
                sweptLevelPrice: lvl.price,
                sweptLevelType: lvl.type,
                wickSize: upperWick,
                closeLocation: c.close,
                time: c.time,
                recencyCandles,
                reactionStrength,
                rvol: Number(candleRvol.toFixed(2)),
              };
            }
          }
        } else {
          // Bullish Sweep: price traded below support, but closed above it
          if (c.low < lvl.price && c.close > lvl.price) {
            const lowerWick = Math.min(c.open, c.close) - c.low;
            const bodySize = Math.abs(c.close - c.open);
            const closeLocationRatio = (c.close - c.low) / candleRange;

            // Significant rejection wick: wick >= 0.2 * ATR, wick > body * 0.7, close in upper 60% of candle
            if (
              lowerWick >= atrVal * 0.2 &&
              lowerWick >= bodySize * 0.6 &&
              closeLocationRatio >= 0.35
            ) {
              const reactionStrength = Number((lowerWick / candleRange).toFixed(2));
              return {
                direction: "BULLISH",
                sweptLevelPrice: lvl.price,
                sweptLevelType: lvl.type,
                wickSize: lowerWick,
                closeLocation: c.close,
                time: c.time,
                recencyCandles,
                reactionStrength,
                rvol: Number(candleRvol.toFixed(2)),
              };
            }
          }
        }
      }
    }

    return null;
  }
}
