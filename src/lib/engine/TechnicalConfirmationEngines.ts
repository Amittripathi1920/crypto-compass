import type { Candle } from "../indicators";
import { sma } from "../indicators";

export class MomentumEngine {
  public static isSupported(
    rsiVal: number,
    macd: { macd: number; signal: number; histogram: number },
    direction: "LONG" | "SHORT"
  ): { ok: boolean; score: number; reason: string } {
    const isLong = direction === "LONG";
    
    if (isLong) {
      // Bullish Momentum Confluences:
      // - RSI is rising and not overbought (e.g. 45 - 65)
      // - MACD histogram is positive
      const isRsiOk = rsiVal > 42 && rsiVal < 70;
      const isMacdOk = macd.histogram > 0;
      
      let score = 0;
      if (isRsiOk) score += 5;
      if (isMacdOk) score += 5;
      
      return {
        ok: isRsiOk || isMacdOk,
        score,
        reason: `RSI is ${rsiVal.toFixed(1)} (${isRsiOk ? "supportive" : "neutral"}) and MACD Hist is ${macd.histogram.toFixed(6)}`
      };
    } else {
      // Bearish Momentum Confluences:
      // - RSI is falling and not oversold (e.g. 30 - 55)
      // - MACD histogram is negative
      const isRsiOk = rsiVal < 58 && rsiVal > 30;
      const isMacdOk = macd.histogram < 0;
      
      let score = 0;
      if (isRsiOk) score += 5;
      if (isMacdOk) score += 5;
      
      return {
        ok: isRsiOk || isMacdOk,
        score,
        reason: `RSI is ${rsiVal.toFixed(1)} (${isRsiOk ? "supportive" : "neutral"}) and MACD Hist is ${macd.histogram.toFixed(6)}`
      };
    }
  }
}

export class VolumeEngine {
  public static calculateRvol(candles: Candle[], period = 20): { rvol: number; isExpanding: boolean; score: number } {
    if (candles.length < period) return { rvol: 1.0, isExpanding: false, score: 0 };
    
    const vols = candles.map((c) => c.volume);
    const currentVol = vols[vols.length - 1] ?? 0;
    const avgVol = sma(vols.slice(0, -1), period);
    
    const rvol = avgVol === 0 ? 1.0 : currentVol / avgVol;
    const isExpanding = rvol >= 1.25;
    const score = rvol >= 1.5 ? 10 : rvol >= 1.25 ? 7 : rvol >= 0.9 ? 5 : 2;
    
    return { rvol, isExpanding, score };
  }
}

export class VolatilityEngine {
  public static analyze(
    candles: Candle[],
    atrVal: number,
    lastPrice: number
  ): { isHealthy: boolean; atrPct: number; score: number; reason: string } {
    const atrPct = lastPrice === 0 ? 0 : (atrVal / lastPrice) * 100;
    
    // In low volatility (ATR % < 0.25%), trades can get stuck
    // In extreme volatility (ATR % > 8%), risk of spikes is extremely high
    const isHealthy = atrPct >= 0.15 && atrPct <= 7.0;
    let score = 5;
    let reason = "Healthy volatility parameters";
    
    if (atrPct < 0.15) {
      score = 2;
      reason = `Volatility too low (${atrPct.toFixed(2)}%) for reliable structural moves.`;
    } else if (atrPct > 7.0) {
      score = 2;
      reason = `Volatility excessively high (${atrPct.toFixed(2)}%), widening stops.`;
    }
    
    return { isHealthy, atrPct, score, reason };
  }
}
