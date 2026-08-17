import type { Candle } from "../indicators";
import { sma } from "../indicators";

export class MomentumEngine {
  public static isSupported(
    rsiVal: number,
    macd: { macd: number; signal: number; histogram: number },
    direction: "LONG" | "SHORT",
  ): { ok: boolean; score: number; reason: string } {
    const isLong = direction === "LONG";

    if (isLong) {
      // Bullish Momentum Confluences:
      // - RSI is between 42 and 68 (rising, not overbought)
      // - MACD histogram is positive or turning up
      const isRsiOk = rsiVal >= 42 && rsiVal <= 68;
      const isMacdOk = macd.histogram > 0;

      let score = 0;
      if (isRsiOk) score += 3;
      if (isMacdOk) score += 2;

      return {
        ok: isRsiOk || isMacdOk,
        score,
        reason: `RSI is ${rsiVal.toFixed(1)} (${isRsiOk ? "supportive" : "neutral"}) and MACD Hist is ${macd.histogram.toFixed(6)}`,
      };
    } else {
      // Bearish Momentum Confluences:
      // - RSI is between 32 and 58 (falling, not oversold)
      // - MACD histogram is negative
      const isRsiOk = rsiVal <= 58 && rsiVal >= 32;
      const isMacdOk = macd.histogram < 0;

      let score = 0;
      if (isRsiOk) score += 3;
      if (isMacdOk) score += 2;

      return {
        ok: isRsiOk || isMacdOk,
        score,
        reason: `RSI is ${rsiVal.toFixed(1)} (${isRsiOk ? "supportive" : "neutral"}) and MACD Hist is ${macd.histogram.toFixed(6)}`,
      };
    }
  }
}

export class VolumeEngine {
  public static calculateRvol(
    candles: Candle[],
    period = 20,
  ): { rvol: number; isExpanding: boolean; score: number } {
    if (candles.length < period) return { rvol: 1.0, isExpanding: false, score: 5 };

    const vols = candles.map((c) => c.volume);
    const currentVol = vols[vols.length - 1] ?? 0;
    const avgVol = sma(vols.slice(0, -1), period) || 1;

    const rvol = avgVol === 0 ? 1.0 : currentVol / avgVol;
    const isExpanding = rvol >= 1.2;
    const score = rvol >= 1.5 ? 10 : rvol >= 1.25 ? 8 : rvol >= 0.95 ? 5 : 2;

    return { rvol: Number(rvol.toFixed(2)), isExpanding, score };
  }
}

export class VolatilityEngine {
  public static analyze(
    candles: Candle[],
    atrVal: number,
    lastPrice: number,
  ): { isHealthy: boolean; atrPct: number; score: number; reason: string } {
    const atrPct = lastPrice === 0 ? 0 : (atrVal / lastPrice) * 100;

    // Healthy tradeable volatility bounds (0.2% - 6.5%)
    const isHealthy = atrPct >= 0.2 && atrPct <= 6.5;
    let score = 5;
    let reason = "Healthy volatility parameters";

    if (atrPct < 0.2) {
      score = 2;
      reason = `Volatility is compressed (${atrPct.toFixed(2)}% ATR); risk of chop.`;
    } else if (atrPct > 6.5) {
      score = 2;
      reason = `Volatility is extreme (${atrPct.toFixed(2)}% ATR); wider structural invalidation required.`;
    }

    return { isHealthy, atrPct: Number(atrPct.toFixed(2)), score, reason };
  }
}
