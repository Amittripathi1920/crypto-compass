import type { Zone, FVG, SwingPoint, LiquidityLevel } from "./types";

export class EntryEngine {
  public static calculateEntry(
    price: number,
    direction: "LONG" | "SHORT",
    mode: "aggressive" | "balanced" | "conservative",
    activeZone: Zone | null,
    activeFvg: FVG | null,
    atrVal: number
  ): number {
    const isLong = direction === "LONG";
    
    if (mode === "aggressive") {
      return price;
    }
    
    if (mode === "conservative") {
      // Retest of zone or FVG
      if (activeZone) {
        return isLong ? activeZone.topPrice : activeZone.bottomPrice;
      }
      if (activeFvg) {
        return isLong ? activeFvg.bottomPrice : activeFvg.topPrice; // enter at FVG boundary
      }
      return price;
    }
    
    // Balanced: 50% retracement of the immediate zone to current price range
    if (activeZone) {
      const zoneBase = isLong ? activeZone.bottomPrice : activeZone.topPrice;
      return (price + zoneBase) / 2;
    }
    return price;
  }
}

export class StopLossEngine {
  public static calculateStop(
    entry: number,
    direction: "LONG" | "SHORT",
    swings: SwingPoint[],
    atrVal: number,
    multiplier = 0.20
  ): { stopLoss: number; isValid: boolean; reason?: string } {
    const isLong = direction === "LONG";
    const buffer = atrVal * multiplier;
    
    // Find the most recent structural swing low/high for invalidation
    const relevantSwings = swings.filter((s) => isLong ? s.type === "low" : s.type === "high");
    const lastSwing = relevantSwings.pop();
    
    if (!lastSwing) {
      // Fallback to ATR-only stop
      const sl = isLong ? entry - atrVal * 1.5 : entry + atrVal * 1.5;
      return { stopLoss: sl, isValid: true };
    }
    
    const stopLoss = isLong ? lastSwing.price - buffer : lastSwing.price + buffer;
    
    // Validate stop distance
    const stopDistPct = (Math.abs(entry - stopLoss) / entry) * 100;
    
    if (stopDistPct < 0.2) {
      // Too tight, close to market noise. Adjust to 0.4% minimum ATR stop
      const adjustedSl = isLong ? entry - atrVal * 0.8 : entry + atrVal * 0.8;
      return {
        stopLoss: adjustedSl,
        isValid: true,
        reason: "Adjusted stop loss to be outside immediate noise threshold"
      };
    }
    
    if (stopDistPct > 5.5) {
      // Too wide, unacceptable risk
      return {
        stopLoss,
        isValid: false,
        reason: `Stop loss distance too wide (${stopDistPct.toFixed(2)}%). Setup invalidated due to high risk.`
      };
    }
    
    return { stopLoss, isValid: true };
  }
}

export type Targets = {
  tp1: number;
  tp2: number;
  tp3: number;
};

export class TakeProfitEngine {
  public static calculateTargets(
    entry: number,
    stopLoss: number,
    direction: "LONG" | "SHORT",
    liquidity: LiquidityLevel[],
    zones: Zone[],
    atrVal: number
  ): Targets {
    const isLong = direction === "LONG";
    const risk = Math.abs(entry - stopLoss);
    
    // Find target resistance/support pools in the direction of the trade
    const candidateLevels = liquidity
      .filter((l) => !l.isSwept)
      .filter((l) => isLong ? l.price > entry : l.price < entry)
      .map((l) => l.price);
      
    const candidateZones = zones
      .filter((z) => isLong ? z.type === "SUPPLY" : z.type === "DEMAND")
      .map((z) => isLong ? z.bottomPrice : z.topPrice);
      
    const allTargets = Array.from(new Set([...candidateLevels, ...candidateZones]));
    
    // Sort targets: ascending for long, descending for short (closest to price first)
    if (isLong) {
      allTargets.sort((a, b) => a - b);
    } else {
      allTargets.sort((a, b) => b - a);
    }
    
    let tp1 = isLong ? entry + risk * 1.5 : entry - risk * 1.5;
    let tp2 = isLong ? entry + risk * 2.5 : entry - risk * 2.5;
    let tp3 = isLong ? entry + risk * 4.0 : entry - risk * 4.0;
    
    // Map structural targets
    if (allTargets.length >= 1) {
      // TP1 can be the first structural resistance, but at least 1.0R to cover costs
      const structuralT1 = allTargets[0]!;
      const t1R = Math.abs(structuralT1 - entry) / risk;
      if (t1R >= 1.0) {
        tp1 = structuralT1;
      }
    }
    
    if (allTargets.length >= 2) {
      const structuralT2 = allTargets[1]!;
      const t2R = Math.abs(structuralT2 - entry) / risk;
      if (t2R >= 1.8) {
        tp2 = structuralT2;
      }
    }
    
    if (allTargets.length >= 3) {
      const structuralT3 = allTargets[2]!;
      const t3R = Math.abs(structuralT3 - entry) / risk;
      if (t3R >= 2.8) {
        tp3 = structuralT3;
      }
    } else {
      // Fallback: TP3 is 3.5R
      tp3 = isLong ? entry + risk * 3.5 : entry - risk * 3.5;
    }
    
    // Final check to make sure targets increase sequentially
    if (isLong) {
      if (tp2 <= tp1) tp2 = tp1 + risk * 1.0;
      if (tp3 <= tp2) tp3 = tp2 + risk * 1.5;
    } else {
      if (tp2 >= tp1) tp2 = tp1 - risk * 1.0;
      if (tp3 >= tp2) tp3 = tp2 - risk * 1.5;
    }

    return { tp1, tp2, tp3 };
  }
}

export class RiskEngine {
  public static analyze(
    entry: number,
    stopLoss: number,
    targets: Targets,
    direction: "LONG" | "SHORT",
    accountBalance: number,
    riskPct = 1.0
  ) {
    const risk = Math.abs(entry - stopLoss);
    if (risk === 0) return null;
    
    const r1 = Math.abs(targets.tp1 - entry) / risk;
    const r2 = Math.abs(targets.tp2 - entry) / risk;
    const r3 = Math.abs(targets.tp3 - entry) / risk;
    
    // Sizing: Sizing should be controlled by Account Risk % + Stop distance
    const riskAmount = accountBalance * (riskPct / 100);
    const stopDistPct = (risk / entry);
    const positionSize = stopDistPct === 0 ? 0 : riskAmount / stopDistPct;
    
    const leverage = accountBalance === 0 ? 1 : positionSize / accountBalance;
    
    // EV: WinRate * average R - LossRate * 1R (Assuming 50% baseline winrate)
    const winRate = 0.50;
    const ev = (winRate * r2) - ((1 - winRate) * 1.0);
    
    return {
      riskAmount,
      positionSize,
      leverage: Number(leverage.toFixed(1)),
      riskReward: {
        tp1: Number(r1.toFixed(2)),
        tp2: Number(r2.toFixed(2)),
        tp3: Number(r3.toFixed(2)),
      },
      ev: Number(ev.toFixed(2))
    };
  }
}
