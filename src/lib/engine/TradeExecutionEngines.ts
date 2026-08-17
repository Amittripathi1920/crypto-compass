import type {
  Zone,
  FVG,
  SwingPoint,
  LiquidityLevel,
  LiquiditySweep,
  SetupType,
  Targets,
  RiskReward,
} from "./types";

export type EntryResult = {
  entryPrice: number;
  isConfirmed: boolean;
  entryType: SetupType | "MARKET_STRUCTURE";
  description: string;
};

export class EntryEngine {
  public static calculateEntry(
    currentPrice: number,
    direction: "LONG" | "SHORT",
    activeSweep: LiquiditySweep | null,
    activeZone: Zone | null,
    activeFvg: FVG | null,
    lastSwing: SwingPoint | null,
    atrVal: number,
    has5mConfirmation: boolean,
  ): EntryResult {
    const isLong = direction === "LONG";

    // 1. Liquidity Sweep Entry: Entry after rejection back inside range
    if (activeSweep && activeSweep.direction === (isLong ? "BULLISH" : "BEARISH")) {
      return {
        entryPrice: currentPrice,
        isConfirmed: has5mConfirmation || activeSweep.recencyCandles! <= 3,
        entryType: "LIQUIDITY_SWEEP",
        description: `Sweep of ${activeSweep.sweptLevelType} at $${activeSweep.sweptLevelPrice.toLocaleString()} confirmed by rejection wick.`,
      };
    }

    // 2. Order Block Retest Entry: Enter at the boundary or shallow test of the fresh OB
    if (activeZone && activeZone.isFresh) {
      const entryPrice = isLong ? activeZone.topPrice : activeZone.bottomPrice;
      // In range or slightly beyond boundary
      const isPriceNearZone = isLong
        ? currentPrice >= activeZone.bottomPrice - atrVal * 0.2 &&
          currentPrice <= activeZone.topPrice + atrVal * 0.3
        : currentPrice <= activeZone.topPrice + atrVal * 0.2 &&
          currentPrice >= activeZone.bottomPrice - atrVal * 0.3;

      return {
        entryPrice: isPriceNearZone ? currentPrice : entryPrice,
        isConfirmed: isPriceNearZone && (has5mConfirmation || activeZone.volumeConfirm >= 1.2),
        entryType: isLong ? "DEMAND_ZONE" : "SUPPLY_ZONE",
        description: `Reaction to fresh ${activeZone.type} Order Block ($${activeZone.bottomPrice.toLocaleString()} - $${activeZone.topPrice.toLocaleString()}).`,
      };
    }

    // 3. FVG Retest Entry: Enter at FVG boundary
    if (activeFvg && activeFvg.isFresh) {
      const entryPrice = isLong ? activeFvg.topPrice : activeFvg.bottomPrice;
      const isPriceNearFvg = isLong
        ? currentPrice >= activeFvg.bottomPrice && currentPrice <= activeFvg.topPrice + atrVal * 0.2
        : currentPrice <= activeFvg.topPrice &&
          currentPrice >= activeFvg.bottomPrice - atrVal * 0.2;

      return {
        entryPrice: isPriceNearFvg ? currentPrice : entryPrice,
        isConfirmed: isPriceNearFvg && has5mConfirmation,
        entryType: "FVG_RETEST",
        description: `Retest of ${activeFvg.direction} Fair Value Gap ($${activeFvg.bottomPrice.toLocaleString()} - $${activeFvg.topPrice.toLocaleString()}).`,
      };
    }

    // 4. Market Structure Breakout / Swing Retest
    if (lastSwing) {
      return {
        entryPrice: currentPrice,
        isConfirmed: has5mConfirmation,
        entryType: "BOS",
        description: `Structural breakout/continuation above recent swing level ($${lastSwing.price.toLocaleString()}).`,
      };
    }

    return {
      entryPrice: currentPrice,
      isConfirmed: has5mConfirmation,
      entryType: "MARKET_STRUCTURE",
      description: "Market structure entry based on prevailing momentum.",
    };
  }
}

export type StopLossResult = {
  stopLoss: number;
  isValid: boolean;
  stopDistance: number;
  stopDistancePct: number;
  stopDistanceAtr: number;
  reason?: string | undefined;
};

export class StopLossEngine {
  /**
   * Calculates structural Stop Loss using swing invalidation + dynamic ATR buffer.
   * Stop Loss is validated against ATR bounds (min 0.4x ATR, max 4.5x ATR).
   */
  public static calculateStop(
    entry: number,
    direction: "LONG" | "SHORT",
    swings: SwingPoint[],
    activeZone: Zone | null,
    activeFvg: FVG | null,
    atrVal: number,
    multiplier = 0.35,
    maxAtrMultiplier = 4.5,
    minAtrMultiplier = 0.4,
  ): StopLossResult {
    const isLong = direction === "LONG";
    const buffer = Math.max(atrVal * multiplier, entry * 0.001);

    // Find structural invalidation level
    const relevantSwings = swings.filter((s) => (isLong ? s.type === "low" : s.type === "high"));
    const lastSwing = relevantSwings[relevantSwings.length - 1];

    let invalidationRef = entry;
    if (lastSwing) {
      invalidationRef = lastSwing.price;
    }

    // If there is an active zone or FVG, use its structural extreme if safer
    if (isLong) {
      if (activeZone && activeZone.bottomPrice < invalidationRef) {
        invalidationRef = activeZone.bottomPrice;
      }
      if (activeFvg && activeFvg.bottomPrice < invalidationRef) {
        invalidationRef = activeFvg.bottomPrice;
      }
    } else {
      if (activeZone && activeZone.topPrice > invalidationRef) {
        invalidationRef = activeZone.topPrice;
      }
      if (activeFvg && activeFvg.topPrice > invalidationRef) {
        invalidationRef = activeFvg.topPrice;
      }
    }

    let stopLoss = isLong ? invalidationRef - buffer : invalidationRef + buffer;
    let stopDistance = Math.abs(entry - stopLoss);
    let stopDistanceAtr = atrVal > 0 ? stopDistance / atrVal : 1;

    // Minimum noise protection: Stop loss must be at least minAtrMultiplier * ATR away
    const minBuffer = atrVal * minAtrMultiplier;
    if (stopDistance < minBuffer) {
      stopLoss = isLong ? entry - minBuffer : entry + minBuffer;
      stopDistance = minBuffer;
      stopDistanceAtr = minAtrMultiplier;
    }

    // Maximum risk check: Stop loss beyond maxAtrMultiplier * ATR is unacceptable risk
    const stopDistancePct = (stopDistance / (entry || 1)) * 100;
    const isValid =
      stopDistanceAtr <= maxAtrMultiplier && (isLong ? stopLoss < entry : stopLoss > entry);

    let reason: string | undefined;
    if (!isValid) {
      if (stopDistanceAtr > maxAtrMultiplier) {
        reason = `Structural stop loss distance is too wide (${stopDistanceAtr.toFixed(1)}x ATR / ${stopDistancePct.toFixed(2)}%). Exceeds maximum risk limit (${maxAtrMultiplier}x ATR).`;
      } else {
        reason = "Stop loss level is invalid or in reverse direction.";
      }
    }

    return {
      stopLoss,
      isValid,
      stopDistance,
      stopDistancePct: Number(stopDistancePct.toFixed(2)),
      stopDistanceAtr: Number(stopDistanceAtr.toFixed(2)),
      reason,
    };
  }
}

export class TakeProfitEngine {
  /**
   * Calculates structural targets using opposing liquidity pools & zones.
   * Enforces minimum R:R spacing (TP1 >= 1.0R, TP2 >= 1.8R, TP3 >= 3.0R) with fixed R fallbacks.
   */
  public static calculateTargets(
    entry: number,
    stopLoss: number,
    direction: "LONG" | "SHORT",
    liquidity: LiquidityLevel[],
    zones: Zone[],
    atrVal: number,
  ): Targets {
    const isLong = direction === "LONG";
    const risk = Math.max(Math.abs(entry - stopLoss), atrVal * 0.4);

    // Opposing unswept liquidity pools
    const candidateLevels = liquidity
      .filter((l) => !l.isSwept)
      .filter((l) => (isLong ? l.price > entry : l.price < entry))
      .map((l) => l.price);

    // Opposing unmitigated supply/demand zones
    const candidateZones = zones
      .filter((z) => (isLong ? z.type === "SUPPLY" : z.type === "DEMAND"))
      .map((z) => (isLong ? z.bottomPrice : z.topPrice))
      .filter((p) => (isLong ? p > entry : p < entry));

    const allTargets = Array.from(new Set([...candidateLevels, ...candidateZones]));

    // Sort: ascending for LONG (lowest resistance first), descending for SHORT (highest support first)
    if (isLong) {
      allTargets.sort((a, b) => a - b);
    } else {
      allTargets.sort((a, b) => b - a);
    }

    let tp1 = isLong ? entry + risk * 1.5 : entry - risk * 1.5;
    let tp2 = isLong ? entry + risk * 2.5 : entry - risk * 2.5;
    let tp3 = isLong ? entry + risk * 4.0 : entry - risk * 4.0;

    // Structural Target 1 (Nearest opposing pool, at least 1.0R)
    const validT1 = allTargets.find((p) => Math.abs(p - entry) / risk >= 1.0);
    if (validT1 !== undefined) {
      tp1 = validT1;
    }

    // Structural Target 2 (Major liquidity pool / key zone, at least 1.8R)
    const validT2 = allTargets.find(
      (p) => Math.abs(p - entry) / risk >= 1.8 && (isLong ? p > tp1 : p < tp1),
    );
    if (validT2 !== undefined) {
      tp2 = validT2;
    } else {
      tp2 = isLong
        ? Math.max(tp1 + risk * 1.0, entry + risk * 2.5)
        : Math.min(tp1 - risk * 1.0, entry - risk * 2.5);
    }

    // Structural Target 3 (HTF swing liquidity, at least 3.0R)
    const validT3 = allTargets.find(
      (p) => Math.abs(p - entry) / risk >= 3.0 && (isLong ? p > tp2 : p < tp2),
    );
    if (validT3 !== undefined) {
      tp3 = validT3;
    } else {
      tp3 = isLong ? tp2 + risk * 1.5 : tp2 - risk * 1.5;
    }

    // Ensure sequential target progression
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
    accountBalance = 1000,
    riskPct = 1.0,
  ): {
    riskAmount: number;
    positionSize: number;
    leverage: number;
    riskReward: RiskReward;
    ev: number;
  } | null {
    const risk = Math.abs(entry - stopLoss);
    if (risk === 0 || entry === 0) return null;

    const r1 = Math.abs(targets.tp1 - entry) / risk;
    const r2 = Math.abs(targets.tp2 - entry) / risk;
    const r3 = Math.abs(targets.tp3 - entry) / risk;

    const riskAmount = accountBalance * (riskPct / 100);
    const stopDistPct = risk / entry;
    const positionSize = stopDistPct === 0 ? 0 : riskAmount / stopDistPct;
    const leverage = accountBalance === 0 ? 1 : positionSize / accountBalance;

    // Expected value assuming 50% baseline win rate targeting TP2
    const winRate = 0.5;
    const ev = winRate * r2 - (1 - winRate) * 1.0;

    return {
      riskAmount,
      positionSize,
      leverage: Number(leverage.toFixed(1)),
      riskReward: {
        tp1: Number(r1.toFixed(2)),
        tp2: Number(r2.toFixed(2)),
        tp3: Number(r3.toFixed(2)),
      },
      ev: Number(ev.toFixed(2)),
    };
  }
}
