import type {
  Zone,
  FVG,
  SwingPoint,
  LiquidityLevel,
  LiquiditySweep,
  SetupType,
  EntryType,
  EntryZone,
  Targets,
  RiskReward,
} from "./types";

export type EntryResult = {
  entryPrice: number;
  entryType: EntryType;
  entryZone: EntryZone;
  triggerCondition: string;
  expirationCandles: number;
  isConfirmed: boolean;
  setupType: SetupType;
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

    // 1. Liquidity Sweep Entry: Immediate Market Entry upon closed rejection candle
    if (activeSweep && activeSweep.direction === (isLong ? "BULLISH" : "BEARISH")) {
      const minZone = isLong ? activeSweep.sweptLevelPrice : currentPrice - atrVal * 0.2;
      const maxZone = isLong ? currentPrice + atrVal * 0.2 : activeSweep.sweptLevelPrice;
      const isConfirmed = has5mConfirmation || (activeSweep.recencyCandles ?? 0) <= 2;

      return {
        entryPrice: currentPrice,
        entryType: "MARKET",
        entryZone: { min: Math.min(minZone, maxZone), max: Math.max(minZone, maxZone) },
        triggerCondition: `Immediate market execution on closed 5M rejection wick after sweep of ${activeSweep.sweptLevelType} ($${activeSweep.sweptLevelPrice.toLocaleString()}).`,
        expirationCandles: 6,
        isConfirmed,
        setupType: "LIQUIDITY_SWEEP",
        description: `Sweep of ${activeSweep.sweptLevelType} at $${activeSweep.sweptLevelPrice.toLocaleString()} confirmed by rejection wick.`,
      };
    }

    // 2. Order Block Retest Entry: Limit order at OB boundary / 50% mitigation
    if (activeZone && activeZone.isFresh) {
      const limitEntry = isLong ? activeZone.topPrice : activeZone.bottomPrice;
      const zoneMin = Math.min(activeZone.bottomPrice, activeZone.topPrice);
      const zoneMax = Math.max(activeZone.bottomPrice, activeZone.topPrice);

      // Price already inside zone vs pending pullback
      const isPriceInside = currentPrice >= zoneMin && currentPrice <= zoneMax;
      const entryType: EntryType = isPriceInside ? "MARKET" : "LIMIT";
      const entryPrice = isPriceInside ? currentPrice : limitEntry;

      return {
        entryPrice,
        entryType,
        entryZone: { min: zoneMin, max: zoneMax },
        triggerCondition: isPriceInside
          ? `Market execution inside fresh ${activeZone.type} Order Block ($${zoneMin.toLocaleString()} - $${zoneMax.toLocaleString()}).`
          : `Limit order placed at ${activeZone.type} Order Block boundary ($${limitEntry.toLocaleString()}).`,
        expirationCandles: 12,
        isConfirmed: isPriceInside ? has5mConfirmation : true,
        setupType: isLong ? "DEMAND_ZONE" : "SUPPLY_ZONE",
        description: `Reaction to fresh ${activeZone.type} Order Block ($${zoneMin.toLocaleString()} - $${zoneMax.toLocaleString()}).`,
      };
    }

    // 3. FVG Retest Entry: Limit order at FVG boundary
    if (activeFvg && activeFvg.isFresh) {
      const limitEntry = isLong ? activeFvg.topPrice : activeFvg.bottomPrice;
      const fvgMin = Math.min(activeFvg.bottomPrice, activeFvg.topPrice);
      const fvgMax = Math.max(activeFvg.bottomPrice, activeFvg.topPrice);

      const isPriceInside = currentPrice >= fvgMin && currentPrice <= fvgMax;
      const entryType: EntryType = isPriceInside ? "MARKET" : "LIMIT";
      const entryPrice = isPriceInside ? currentPrice : limitEntry;

      return {
        entryPrice,
        entryType,
        entryZone: { min: fvgMin, max: fvgMax },
        triggerCondition: isPriceInside
          ? `Market execution inside ${activeFvg.direction} Fair Value Gap ($${fvgMin.toLocaleString()} - $${fvgMax.toLocaleString()}).`
          : `Limit order placed at ${activeFvg.direction} FVG boundary ($${limitEntry.toLocaleString()}).`,
        expirationCandles: 10,
        isConfirmed: isPriceInside ? has5mConfirmation : true,
        setupType: "FVG_RETEST",
        description: `Retest of ${activeFvg.direction} Fair Value Gap ($${fvgMin.toLocaleString()} - $${fvgMax.toLocaleString()}).`,
      };
    }

    // 4. Market Structure Breakout Trigger: Stop-market on closed breakout
    if (lastSwing) {
      const breakoutPrice = lastSwing.price;
      return {
        entryPrice: breakoutPrice,
        entryType: "BREAKOUT",
        entryZone: {
          min: isLong ? breakoutPrice : breakoutPrice - atrVal * 0.3,
          max: isLong ? breakoutPrice + atrVal * 0.3 : breakoutPrice,
        },
        triggerCondition: `Wait for closed 15M candle breakout above structural swing level ($${breakoutPrice.toLocaleString()}).`,
        expirationCandles: 8,
        isConfirmed: has5mConfirmation,
        setupType: "BOS",
        description: `Structural breakout/continuation above recent swing level ($${breakoutPrice.toLocaleString()}).`,
      };
    }

    // 5. Fallback confirmation entry
    return {
      entryPrice: currentPrice,
      entryType: "CONFIRMATION",
      entryZone: { min: currentPrice - atrVal * 0.2, max: currentPrice + atrVal * 0.2 },
      triggerCondition: "Wait for 5M micro-structure reversal (CHoCH) and volume expansion.",
      expirationCandles: 6,
      isConfirmed: has5mConfirmation,
      setupType: "BOS",
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
  anchorType: "PROTECTED_SWING" | "MAJOR_SWING" | "ZONE_EXTREME" | "INTERNAL_SWING";
  reason?: string | undefined;
};

export class StopLossEngine {
  /**
   * Calculates structural Stop Loss anchored to PROTECTED swings or ZONE extremes,
   * avoiding tiny internal noise pivots.
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

    // Filter relevant swings
    const relevantSwings = swings.filter((s) => (isLong ? s.type === "low" : s.type === "high"));

    // 1. First priority: Protected swing (the swing that caused a BOS / CHoCH)
    const protectedSwing = relevantSwings
      .filter((s) => s.classification === "PROTECTED")
      .pop();

    // 2. Second priority: Major HTF swing
    const majorSwing = relevantSwings
      .filter((s) => s.classification === "MAJOR" || s.isExternal)
      .pop();

    // 3. Third priority: Recent swing
    const recentSwing = relevantSwings[relevantSwings.length - 1];

    let invalidationRef = entry;
    let anchorType: StopLossResult["anchorType"] = "INTERNAL_SWING";

    if (protectedSwing) {
      invalidationRef = protectedSwing.price;
      anchorType = "PROTECTED_SWING";
    } else if (majorSwing) {
      invalidationRef = majorSwing.price;
      anchorType = "MAJOR_SWING";
    } else if (recentSwing) {
      invalidationRef = recentSwing.price;
      anchorType = "INTERNAL_SWING";
    }

    // If active OB or FVG provides a deeper, safer structural extreme, anchor to it
    if (isLong) {
      if (activeZone && activeZone.bottomPrice < invalidationRef) {
        invalidationRef = activeZone.bottomPrice;
        anchorType = "ZONE_EXTREME";
      }
      if (activeFvg && activeFvg.bottomPrice < invalidationRef) {
        invalidationRef = activeFvg.bottomPrice;
        anchorType = "ZONE_EXTREME";
      }
    } else {
      if (activeZone && activeZone.topPrice > invalidationRef) {
        invalidationRef = activeZone.topPrice;
        anchorType = "ZONE_EXTREME";
      }
      if (activeFvg && activeFvg.topPrice > invalidationRef) {
        invalidationRef = activeFvg.topPrice;
        anchorType = "ZONE_EXTREME";
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
      anchorType,
      reason,
    };
  }
}

export class TakeProfitEngine {
  /**
   * Calculates structural targets strictly using opposing unswept liquidity pools & zones.
   * If genuine structural liquidity does not exist beyond minimumRR, marks isStructural = false.
   */
  public static calculateTargets(
    entry: number,
    stopLoss: number,
    direction: "LONG" | "SHORT",
    liquidity: LiquidityLevel[],
    zones: Zone[],
    atrVal: number,
    minimumRR = 1.5,
  ): Targets {
    const isLong = direction === "LONG";
    const risk = Math.max(Math.abs(entry - stopLoss), atrVal * 0.4);

    // Candidate opposing unswept liquidity pools
    const candidateLevels = liquidity
      .filter((l) => !l.isSwept)
      .filter((l) => (isLong ? l.price > entry : l.price < entry))
      .map((l) => l.price);

    // Candidate opposing unmitigated supply/demand zones
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

    // Structural Target 1 (Nearest opposing pool, at least 1.0R)
    const validT1 = allTargets.find((p) => Math.abs(p - entry) / risk >= 1.0);

    // Structural Target 2 (Major liquidity pool / key zone, at least minimumRR)
    const validT2 = allTargets.find(
      (p) =>
        Math.abs(p - entry) / risk >= minimumRR &&
        (validT1 ? (isLong ? p > validT1 : p < validT1) : true),
    );

    // Structural Target 3 (HTF swing liquidity, at least 2.5R)
    const validT3 = allTargets.find(
      (p) =>
        Math.abs(p - entry) / risk >= 2.5 &&
        (validT2 ? (isLong ? p > validT2 : p < validT2) : true),
    );

    const isStructural = validT1 !== undefined && validT2 !== undefined;

    const tp1 = validT1 ?? (isLong ? entry + risk * 1.5 : entry - risk * 1.5);
    const tp2 = validT2 ?? (isLong ? tp1 + risk * 1.0 : tp1 - risk * 1.0);
    const tp3 = validT3 ?? (isLong ? tp2 + risk * 1.5 : tp2 - risk * 1.5);

    return {
      tp1,
      tp2,
      tp3,
      isStructural,
    };
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
    makerFeeBps = 2,
    takerFeeBps = 5,
    slippageBps = 4,
  ): {
    riskAmount: number;
    positionSize: number;
    leverage: number;
    riskReward: RiskReward;
    netRiskReward: RiskReward;
    estimatedFees: number;
    ev: number;
  } | null {
    const risk = Math.abs(entry - stopLoss);
    if (risk === 0 || entry === 0) return null;

    const r1Gross = Math.abs(targets.tp1 - entry) / risk;
    const r2Gross = Math.abs(targets.tp2 - entry) / risk;
    const r3Gross = Math.abs(targets.tp3 - entry) / risk;

    const riskAmount = accountBalance * (riskPct / 100);
    const stopDistPct = risk / entry;
    const positionSize = stopDistPct === 0 ? 0 : riskAmount / stopDistPct;
    const leverage = accountBalance === 0 ? 1 : positionSize / accountBalance;

    // Fee & slippage friction calculation
    const roundTripFeePct = ((takerFeeBps + makerFeeBps + slippageBps * 2) / 10000);
    const estimatedFees = positionSize * roundTripFeePct;
    const feeInR = riskAmount > 0 ? estimatedFees / riskAmount : 0;

    const r1Net = Math.max(0, r1Gross - feeInR);
    const r2Net = Math.max(0, r2Gross - feeInR);
    const r3Net = Math.max(0, r3Gross - feeInR);

    // Expected value assuming 50% baseline win rate targeting TP2 net of fees
    const winRate = 0.5;
    const ev = winRate * r2Net - (1 - winRate) * (1.0 + feeInR);

    return {
      riskAmount,
      positionSize,
      leverage: Number(leverage.toFixed(1)),
      riskReward: {
        tp1: Number(r1Gross.toFixed(2)),
        tp2: Number(r2Gross.toFixed(2)),
        tp3: Number(r3Gross.toFixed(2)),
      },
      netRiskReward: {
        tp1: Number(r1Net.toFixed(2)),
        tp2: Number(r2Net.toFixed(2)),
        tp3: Number(r3Net.toFixed(2)),
      },
      estimatedFees: Number(estimatedFees.toFixed(2)),
      ev: Number(ev.toFixed(2)),
    };
  }
}
