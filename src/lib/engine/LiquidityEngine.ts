import type { Candle } from "../indicators";
import type { LiquidityLevel, LiquiditySweep, SwingPoint } from "./types";

export class LiquidityEngine {
  public static mapLiquidity(
    candles: Candle[],
    dailyCandles: Candle[],
    swings: SwingPoint[],
    atrVal: number
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
      });
      levels.push({
        id: `pdl_${prevDay.time}`,
        type: "PDL",
        price: prevDay.low,
        strength: 20,
        isSwept: false,
        time: prevDay.time,
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
      });
      levels.push({
        id: `pwl_${dailyCandles[dailyCandles.length - 2]!.time}`,
        type: "PWL",
        price: pwl,
        strength: 25,
        isSwept: false,
        time: dailyCandles[dailyCandles.length - 2]!.time,
      });
    }

    // 3. Swing Highs & Lows
    const recentHighs = swings.filter((s) => s.type === "high").slice(-5);
    const recentLows = swings.filter((s) => s.type === "low").slice(-5);

    recentHighs.forEach((h) => {
      levels.push({
        id: `sh_${h.index}`,
        type: "SWING_HIGH",
        price: h.price,
        strength: 15,
        isSwept: false,
        time: h.time,
      });
    });

    recentLows.forEach((l) => {
      levels.push({
        id: `sl_${l.index}`,
        type: "SWING_LOW",
        price: l.price,
        strength: 15,
        isSwept: false,
        time: l.time,
      });
    });

    // 4. Equal Highs & Equal Lows (EQH / EQL)
    // Find near-equal highs/lows within 0.15% threshold
    const threshold = 0.0015;
    
    for (let i = 0; i < recentHighs.length; i++) {
      for (let j = i + 1; j < recentHighs.length; j++) {
        const h1 = recentHighs[i]!;
        const h2 = recentHighs[j]!;
        if (Math.abs(h1.price - h2.price) / h1.price <= threshold) {
          levels.push({
            id: `eqh_${h1.index}_${h2.index}`,
            type: "EQH",
            price: (h1.price + h2.price) / 2,
            strength: 20,
            isSwept: false,
            time: Math.max(h1.time, h2.time),
          });
        }
      }
    }

    for (let i = 0; i < recentLows.length; i++) {
      for (let j = i + 1; j < recentLows.length; j++) {
        const l1 = recentLows[i]!;
        const l2 = recentLows[j]!;
        if (Math.abs(l1.price - l2.price) / l1.price <= threshold) {
          levels.push({
            id: `eql_${l1.index}_${l2.index}`,
            type: "EQL",
            price: (l1.price + l2.price) / 2,
            strength: 20,
            isSwept: false,
            time: Math.max(l1.time, l2.time),
          });
        }
      }
    }

    // Mark levels as swept if historical price action breached them
    // (Only scanning candles after the level's timestamp)
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

  public static detectSweep(
    candles: Candle[],
    levels: LiquidityLevel[],
    atrVal: number
  ): LiquiditySweep | null {
    if (candles.length < 2) return null;
    const currentCandle = candles[candles.length - 1]!;
    
    // Sort levels to look at unswept levels first
    const activeLevels = levels.filter((l) => !l.isSwept);

    for (const lvl of activeLevels) {
      const isHighLvl = ["PDH", "PWH", "EQH", "SWING_HIGH"].includes(lvl.type);
      
      if (isHighLvl) {
        // Bearish Sweep: price went above resistance, but closed below
        if (currentCandle.high > lvl.price && currentCandle.close < lvl.price) {
          const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
          const bodySize = Math.abs(currentCandle.close - currentCandle.open);
          
          // Rejection validation: wick must be significant (>= 0.15 * ATR and wick > body)
          if (upperWick >= atrVal * 0.15 && upperWick > bodySize * 0.8) {
            return {
              direction: "BEARISH",
              sweptLevelPrice: lvl.price,
              sweptLevelType: lvl.type,
              wickSize: upperWick,
              closeLocation: currentCandle.close,
              time: currentCandle.time,
            };
          }
        }
      } else {
        // Bullish Sweep: price went below support, but closed above
        if (currentCandle.low < lvl.price && currentCandle.close > lvl.price) {
          const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
          const bodySize = Math.abs(currentCandle.close - currentCandle.open);
          
          if (lowerWick >= atrVal * 0.15 && lowerWick > bodySize * 0.8) {
            return {
              direction: "BULLISH",
              sweptLevelPrice: lvl.price,
              sweptLevelType: lvl.type,
              wickSize: lowerWick,
              closeLocation: currentCandle.close,
              time: currentCandle.time,
            };
          }
        }
      }
    }
    
    return null;
  }
}
