import type { Candle } from "../indicators";
import { computeIndicators, sma, roundToTick } from "../indicators";
import type {
  OteSignal,
  OteSetupGrade,
  OteSweepEvent,
  OteDisplacement,
  OteFibZone,
  OteEntryModel,
  OteStopLossModel,
  OteTargetsModel,
} from "./types";
import type { Timeframe } from "../coins";
import type { ExchangeId, ExchangeAttempt } from "../market.server";

export class OteEngine {
  public static analyze(
    symbol: string,
    timeframe: Timeframe,
    candlesMacro: Candle[], // 1D for intraday, 1W for swing
    candlesSetup: Candle[], // 4H / 1H / 15M
    candlesTrigger: Candle[], // 15M / 5M
    tickerPrice: number,
    minRR = 1.8,
    minGrade: "B" | "A" | "A+" = "B",
    exchangeInfo: { exchange: ExchangeId; attempts: ExchangeAttempt[] } = {
      exchange: "Binance",
      attempts: [],
    },
  ): OteSignal {
    const currentPrice =
      tickerPrice ||
      candlesTrigger[candlesTrigger.length - 1]?.close ||
      candlesSetup[candlesSetup.length - 1]?.close ||
      0;

    const indMacro = computeIndicators(candlesMacro);
    const indSetup = computeIndicators(candlesSetup);
    const indTrigger = computeIndicators(candlesTrigger);

    const macroBias = indMacro.bias as "BULLISH" | "BEARISH" | "NEUTRAL";
    const atrSetup = indSetup.atr || currentPrice * 0.01;
    const atrTrigger = indTrigger.atr || currentPrice * 0.005;

    // ----------------------------------------------------
    // Pillar 1: Map Macro & Setup Liquidity Pools
    // ----------------------------------------------------
    type OteLiquidityPool = {
      type: "PDH" | "PDL" | "PWH" | "PWL" | "EQH" | "EQL" | "MAJOR_SWING";
      price: number;
      time: number;
      isSwept: boolean;
    };
    const liquidityPools: OteLiquidityPool[] = [];

    // 1. Previous Day High / Low
    if (candlesMacro.length >= 2) {
      const prevDay = candlesMacro[candlesMacro.length - 2]!;
      liquidityPools.push({ type: "PDH", price: prevDay.high, time: prevDay.time, isSwept: false });
      liquidityPools.push({ type: "PDL", price: prevDay.low, time: prevDay.time, isSwept: false });
    }

    // 2. Previous Week High / Low
    if (candlesMacro.length >= 8) {
      const prevWeekSlice = candlesMacro.slice(-8, -1);
      liquidityPools.push({
        type: "PWH",
        price: Math.max(...prevWeekSlice.map((c) => c.high)),
        time: prevWeekSlice[0]!.time,
        isSwept: false,
      });
      liquidityPools.push({
        type: "PWL",
        price: Math.min(...prevWeekSlice.map((c) => c.low)),
        time: prevWeekSlice[0]!.time,
        isSwept: false,
      });
    }

    // 3. Major Swings on Setup Timeframe
    const pivotLen = 4;
    for (let i = pivotLen; i < candlesSetup.length - pivotLen; i++) {
      const c = candlesSetup[i]!;
      const leftHighs = candlesSetup.slice(i - pivotLen, i).map((x) => x.high);
      const rightHighs = candlesSetup.slice(i + 1, i + pivotLen + 1).map((x) => x.high);
      const leftLows = candlesSetup.slice(i - pivotLen, i).map((x) => x.low);
      const rightLows = candlesSetup.slice(i + 1, i + pivotLen + 1).map((x) => x.low);

      if (c.high >= Math.max(...leftHighs) && c.high > Math.max(...rightHighs)) {
        liquidityPools.push({ type: "MAJOR_SWING", price: c.high, time: c.time, isSwept: false });
      }
      if (c.low <= Math.min(...leftLows) && c.low < Math.min(...rightLows)) {
        liquidityPools.push({ type: "MAJOR_SWING", price: c.low, time: c.time, isSwept: false });
      }
    }

    // Check swept status
    for (const pool of liquidityPools) {
      const laterCandles = candlesSetup.filter((c) => c.time > pool.time);
      const isHigh = ["PDH", "PWH", "EQH"].includes(pool.type) || pool.price > currentPrice;
      pool.isSwept = isHigh
        ? laterCandles.some((c) => c.high > pool.price)
        : laterCandles.some((c) => c.low < pool.price);
    }

    // ----------------------------------------------------
    // Pillar 2: Detect Active Liquidity Sweep & Purge
    // ----------------------------------------------------
    const avgTriggerVol = sma(candlesTrigger.map((c) => c.volume).slice(-30), 20) || 1;
    let detectedSweep: OteSweepEvent | null = null;
    let sweepDirection: "BULLISH" | "BEARISH" | null = null;

    // Scan recent candles on trigger timeframe (last 12 candles)
    const scanCandles = candlesTrigger.slice(-12);
    for (let idx = scanCandles.length - 1; idx >= 0; idx--) {
      const candle = scanCandles[idx]!;
      const recency = scanCandles.length - 1 - idx;
      const candleRange = Math.max(candle.high - candle.low, atrTrigger * 0.1);
      const rvol = candle.volume / avgTriggerVol;

      for (const pool of liquidityPools) {
        const isHighPool =
          ["PDH", "PWH", "EQH"].includes(pool.type) ||
          (pool.type === "MAJOR_SWING" && pool.price >= candle.open);
        const isLowPool =
          ["PDL", "PWL", "EQL"].includes(pool.type) ||
          (pool.type === "MAJOR_SWING" && pool.price <= candle.open);

        if (isHighPool && candle.high > pool.price && candle.close < pool.price) {
          // Bearish Sweep: pierced resistance, closed below
          const upperWick = candle.high - Math.max(candle.open, candle.close);
          if (upperWick >= atrTrigger * 0.15 && upperWick / candleRange >= 0.25) {
            detectedSweep = {
              levelType: pool.type,
              price: pool.price,
              time: candle.time,
              wickSize: upperWick,
              wickRatio: Number((upperWick / candleRange).toFixed(2)),
              rvol: Number(rvol.toFixed(2)),
              recencyCandles: recency,
            };
            sweepDirection = "BEARISH";
            break;
          }
        } else if (isLowPool && candle.low < pool.price && candle.close > pool.price) {
          // Bullish Sweep: pierced support, closed above
          const lowerWick = Math.min(candle.open, candle.close) - candle.low;
          if (lowerWick >= atrTrigger * 0.15 && lowerWick / candleRange >= 0.25) {
            detectedSweep = {
              levelType: pool.type,
              price: pool.price,
              time: candle.time,
              wickSize: lowerWick,
              wickRatio: Number((lowerWick / candleRange).toFixed(2)),
              rvol: Number(rvol.toFixed(2)),
              recencyCandles: recency,
            };
            sweepDirection = "BULLISH";
            break;
          }
        }
      }
      if (detectedSweep) break;
    }

    // ----------------------------------------------------
    // Pillar 3: Detect Institutional Displacement & MSS
    // ----------------------------------------------------
    let displacement: OteDisplacement | null = null;
    if (detectedSweep && sweepDirection) {
      const isBull = sweepDirection === "BULLISH";
      const postSweepCandles = candlesTrigger.filter((c) => c.time >= detectedSweep!.time);

      if (postSweepCandles.length >= 2) {
        const sweepOriginLow = isBull
          ? Math.min(...postSweepCandles.map((c) => c.low))
          : Math.min(...postSweepCandles.map((c) => c.low));
        const sweepOriginHigh = isBull
          ? Math.max(...postSweepCandles.map((c) => c.high))
          : Math.max(...postSweepCandles.map((c) => c.high));

        // Find recent displacement leg
        const impulseLeg = Math.abs(sweepOriginHigh - sweepOriginLow);
        const dispAtrRatio = impulseLeg / (atrTrigger || 1);
        const impulseRvol = Math.max(...postSweepCandles.map((c) => c.volume / avgTriggerVol));

        // Detect Fair Value Gap inside displacement
        let fvg: OteDisplacement["fvg"] = null;
        for (let i = 2; i < postSweepCandles.length; i++) {
          const c1 = postSweepCandles[i - 2]!;
          const c2 = postSweepCandles[i - 1]!;
          const c3 = postSweepCandles[i]!;

          if (isBull && c3.low > c1.high && c2.close > c2.open) {
            const gap = c3.low - c1.high;
            fvg = {
              topPrice: c3.low,
              bottomPrice: c1.high,
              midPrice: (c3.low + c1.high) / 2,
              sizeRatioToAtr: Number((gap / (atrTrigger || 1)).toFixed(2)),
              isFresh: currentPrice >= c1.high,
            };
          } else if (!isBull && c3.high < c1.low && c2.close < c2.open) {
            const gap = c1.low - c3.high;
            fvg = {
              topPrice: c1.low,
              bottomPrice: c3.high,
              midPrice: (c1.low + c3.high) / 2,
              sizeRatioToAtr: Number((gap / (atrTrigger || 1)).toFixed(2)),
              isFresh: currentPrice <= c1.low,
            };
          }
        }

        // Detect Order Block (the base before expansion)
        let orderBlock: OteDisplacement["orderBlock"] = null;
        if (postSweepCandles.length >= 2) {
          const baseCandle = postSweepCandles[0]!;
          orderBlock = {
            topPrice: Math.max(baseCandle.open, baseCandle.close),
            bottomPrice: Math.min(baseCandle.open, baseCandle.close),
            rvol: Number((baseCandle.volume / avgTriggerVol).toFixed(2)),
            isFresh: isBull ? currentPrice >= baseCandle.low : currentPrice <= baseCandle.high,
          };
        }

        displacement = {
          direction: sweepDirection,
          impulseCandles: postSweepCandles.length,
          displacementAtrRatio: Number(dispAtrRatio.toFixed(2)),
          rvol: Number(impulseRvol.toFixed(2)),
          mssPrice: isBull ? sweepOriginHigh : sweepOriginLow,
          mssTime: detectedSweep.time,
          fvg,
          orderBlock,
          originSwingLow: sweepOriginLow,
          originSwingHigh: sweepOriginHigh,
        };
      }
    }

    // ----------------------------------------------------
    // Pillar 4: Optimal Trade Entry (OTE) Fib Zone
    // ----------------------------------------------------
    let fibZone: OteFibZone | null = null;
    let inOteZone = false;
    let inDiscountOrPremium = false;

    if (displacement) {
      const isBull = displacement.direction === "BULLISH";
      const origin = isBull ? displacement.originSwingLow : displacement.originSwingHigh;
      const extreme = isBull ? displacement.originSwingHigh : displacement.originSwingLow;
      const legRange = Math.abs(extreme - origin);

      if (legRange > 0) {
        const fib500 = isBull ? extreme - legRange * 0.5 : extreme + legRange * 0.5;
        const fib618 = isBull ? extreme - legRange * 0.618 : extreme + legRange * 0.618;
        const fib705 = isBull ? extreme - legRange * 0.705 : extreme + legRange * 0.705;
        const fib786 = isBull ? extreme - legRange * 0.786 : extreme + legRange * 0.786;

        inDiscountOrPremium = isBull ? currentPrice <= fib500 : currentPrice >= fib500;
        inOteZone = isBull
          ? currentPrice <= fib618 && currentPrice >= fib786 - atrTrigger * 0.2
          : currentPrice >= fib618 && currentPrice <= fib786 + atrTrigger * 0.2;

        fibZone = {
          swingOrigin: origin,
          swingExtreme: extreme,
          fib500: Number(fib500.toFixed(4)),
          fib618: Number(fib618.toFixed(4)),
          fib705: Number(fib705.toFixed(4)),
          fib786: Number(fib786.toFixed(4)),
          currentPrice,
          inOteZone,
          inDiscountOrPremium,
        };
      }
    }

    // ----------------------------------------------------
    // Protected Stop Loss Model
    // ----------------------------------------------------
    const isLong = sweepDirection === "BULLISH";
    const isShort = sweepDirection === "BEARISH";
    const stopBuffer = Math.max(atrTrigger * 0.35, currentPrice * 0.001);

    let stopPrice = isLong ? currentPrice - atrTrigger * 1.5 : currentPrice + atrTrigger * 1.5;
    let anchorType: OteStopLossModel["anchorType"] = "DISPLACEMENT_ORIGIN";

    if (detectedSweep && displacement) {
      if (isLong) {
        stopPrice = displacement.originSwingLow - stopBuffer;
        anchorType = "PROTECTED_SWEEP_LOW";
      } else {
        stopPrice = displacement.originSwingHigh + stopBuffer;
        anchorType = "PROTECTED_SWEEP_HIGH";
      }
    }

    const stopDistance = Math.abs(currentPrice - stopPrice);
    const stopDistancePct = Number(((stopDistance / (currentPrice || 1)) * 100).toFixed(2));
    const stopDistanceAtr = Number((stopDistance / (atrTrigger || 1)).toFixed(2));

    const stopLossModel: OteStopLossModel = {
      stopLossPrice: roundToTick(stopPrice, currentPrice),
      anchorType,
      stopDistance: roundToTick(stopDistance, currentPrice),
      stopDistancePct,
      stopDistanceAtr,
      invalidationStatement: isLong
        ? `Closed candle below protected sweep low at $${fmt(stopPrice)}`
        : `Closed candle above protected sweep high at $${fmt(stopPrice)}`,
    };

    // ----------------------------------------------------
    // Actionable Entry Model & Execution Zone
    // ----------------------------------------------------
    let entryModel: OteEntryModel;
    if (displacement && fibZone) {
      if (fibZone.inOteZone) {
        entryModel = {
          type: "MARKET_OTE",
          entryPrice: roundToTick(currentPrice, currentPrice),
          entryZone: {
            min: roundToTick(Math.min(fibZone.fib618, fibZone.fib786), currentPrice),
            max: roundToTick(Math.max(fibZone.fib618, fibZone.fib786), currentPrice),
          },
          triggerRule: `Market execution inside 61.8%-78.6% OTE Golden Zone ($${fmt(Math.min(fibZone.fib618, fibZone.fib786))} - $${fmt(Math.max(fibZone.fib618, fibZone.fib786))}).`,
          expirationCandles: 8,
        };
      } else if (displacement.fvg && displacement.fvg.isFresh) {
        entryModel = {
          type: "LIMIT_OTE_FVG",
          entryPrice: roundToTick(displacement.fvg.midPrice, currentPrice),
          entryZone: {
            min: roundToTick(displacement.fvg.bottomPrice, currentPrice),
            max: roundToTick(displacement.fvg.topPrice, currentPrice),
          },
          triggerRule: `Limit order placed at 50% Fair Value Gap mitigation ($${fmt(displacement.fvg.midPrice)}).`,
          expirationCandles: 12,
        };
      } else {
        entryModel = {
          type: "LIMIT_OTE_OB",
          entryPrice: roundToTick(fibZone.fib705, currentPrice),
          entryZone: {
            min: roundToTick(Math.min(fibZone.fib618, fibZone.fib786), currentPrice),
            max: roundToTick(Math.max(fibZone.fib618, fibZone.fib786), currentPrice),
          },
          triggerRule: `Limit order waiting for OTE 70.5% sweet-spot retracement ($${fmt(fibZone.fib705)}).`,
          expirationCandles: 12,
        };
      }
    } else {
      entryModel = {
        type: "BREAKOUT_TRIGGER",
        entryPrice: roundToTick(currentPrice, currentPrice),
        entryZone: {
          min: roundToTick(currentPrice - atrTrigger * 0.2, currentPrice),
          max: roundToTick(currentPrice + atrTrigger * 0.2, currentPrice),
        },
        triggerRule: "Awaiting confirmed liquidity purge and displacement on lower timeframe.",
        expirationCandles: 6,
      };
    }

    // ----------------------------------------------------
    // 3-Tier Structural Targets Model
    // ----------------------------------------------------
    const opposingPools = liquidityPools
      .filter((p) => !p.isSwept)
      .filter((p) => (isLong ? p.price > currentPrice : p.price < currentPrice))
      .map((p) => ({ price: p.price, label: `${p.type} Liquidity Pool` }));

    if (isLong) {
      opposingPools.sort((a, b) => a.price - b.price);
    } else {
      opposingPools.sort((a, b) => b.price - a.price);
    }

    const tradeRisk = Math.max(Math.abs(entryModel.entryPrice - stopLossModel.stopLossPrice), atrTrigger * 0.4);

    // Target 1: Nearest opposing liquidity (at least 1.0R) -> De-risk & Move to BE
    const target1Match = opposingPools.find((p) => Math.abs(p.price - entryModel.entryPrice) / tradeRisk >= 1.0);
    const tp1Price = target1Match
      ? target1Match.price
      : isLong
        ? entryModel.entryPrice + tradeRisk * 1.5
        : entryModel.entryPrice - tradeRisk * 1.5;
    const tp1Label = target1Match ? target1Match.label : "Internal Structural De-Risk Target (1.5R)";

    // Target 2: Major opposing liquidity / Key structure (minRR)
    const target2Match = opposingPools.find(
      (p) =>
        Math.abs(p.price - entryModel.entryPrice) / tradeRisk >= minRR &&
        (isLong ? p.price > tp1Price : p.price < tp1Price),
    );
    const tp2Price = target2Match
      ? target2Match.price
      : isLong
        ? tp1Price + tradeRisk * 1.2
        : tp1Price - tradeRisk * 1.2;
    const tp2Label = target2Match ? target2Match.label : "Major Opposing Liquidity Target";

    // Target 3: HTF Macro Liquidity (at least 3.0R)
    const target3Match = opposingPools.find(
      (p) =>
        Math.abs(p.price - entryModel.entryPrice) / tradeRisk >= 3.0 &&
        (isLong ? p.price > tp2Price : p.price < tp2Price),
    );
    const tp3Price = target3Match
      ? target3Match.price
      : isLong
        ? tp2Price + tradeRisk * 1.5
        : tp2Price - tradeRisk * 1.5;
    const tp3Label = target3Match ? target3Match.label : "HTF Macro Liquidity Runner Target";

    const grossR2 = Number((Math.abs(tp2Price - entryModel.entryPrice) / tradeRisk).toFixed(2));
    const netR2 = Number(Math.max(0, grossR2 - 0.08).toFixed(2)); // deducting taker fees & slippage

    const targetsModel: OteTargetsModel = {
      tp1: {
        price: roundToTick(tp1Price, currentPrice),
        label: tp1Label,
        rMultiple: Number((Math.abs(tp1Price - entryModel.entryPrice) / tradeRisk).toFixed(2)),
        pctGain: Number(((Math.abs(tp1Price - entryModel.entryPrice) / (currentPrice || 1)) * 100).toFixed(2)),
      },
      tp2: {
        price: roundToTick(tp2Price, currentPrice),
        label: tp2Label,
        rMultiple: grossR2,
        pctGain: Number(((Math.abs(tp2Price - entryModel.entryPrice) / (currentPrice || 1)) * 100).toFixed(2)),
      },
      tp3: {
        price: roundToTick(tp3Price, currentPrice),
        label: tp3Label,
        rMultiple: Number((Math.abs(tp3Price - entryModel.entryPrice) / tradeRisk).toFixed(2)),
        pctGain: Number(((Math.abs(tp3Price - entryModel.entryPrice) / (currentPrice || 1)) * 100).toFixed(2)),
      },
      grossRR: grossR2,
      netRR: netR2,
      isStructural: !!target1Match && !!target2Match,
    };

    // ----------------------------------------------------
    // Hard Quality Gate, Scoring & Setup Grading
    // ----------------------------------------------------
    const blockers: string[] = [];
    const warnings: string[] = [];
    const context: string[] = [];
    const reasons: string[] = [];

    context.push(`Macro Trend Bias: ${macroBias}`);
    context.push(`Setup Timeframe: ${timeframe.toUpperCase()}`);

    let qualityScore = 0;

    if (!detectedSweep) {
      blockers.push("No confirmed liquidity sweep or trap detected at key price boundaries.");
    } else {
      reasons.push(
        `Purged ${detectedSweep.levelType} liquidity at $${fmt(detectedSweep.price)} with ${detectedSweep.rvol}x RVOL rejection.`,
      );
      qualityScore += 30;
    }

    if (!displacement || displacement.displacementAtrRatio < 0.8) {
      blockers.push("Lacks institutional displacement / impulsive market structure shift (MSS).");
    } else {
      reasons.push(
        `Confirmed institutional displacement (${displacement.displacementAtrRatio}x ATR) breaking counter-trend structure.`,
      );
      qualityScore += 25;
    }

    if (displacement?.fvg) {
      reasons.push(`Unmitigated Fair Value Gap formed ($${fmt(displacement.fvg.bottomPrice)} - $${fmt(displacement.fvg.topPrice)}).`);
      qualityScore += 15;
    }

    if (fibZone?.inOteZone) {
      reasons.push(`Price is situated inside the Optimal Trade Entry (61.8% - 78.6% Fib discount/premium).`);
      qualityScore += 20;
    } else if (fibZone?.inDiscountOrPremium) {
      qualityScore += 10;
    }

    if (targetsModel.isStructural && grossR2 >= minRR) {
      reasons.push(`Opposing structural liquidity offers ${grossR2}R reward-to-risk.`);
      qualityScore += 10;
    } else if (grossR2 < minRR) {
      blockers.push(`Opposing structural liquidity (${grossR2}R) is below minimum threshold (${minRR}R).`);
    }

    // Macro Alignment
    const isMacroAligned = (isLong && macroBias === "BULLISH") || (isShort && macroBias === "BEARISH");
    if (isMacroAligned) {
      qualityScore += 10;
    } else if (macroBias !== "NEUTRAL") {
      warnings.push(`Macro ${macroBias} trend creates minor headwind; requires strict protected invalidation.`);
    }

    // Setup Grading
    let setupGrade: OteSetupGrade = "NO_SETUP";
    let direction: "LONG" | "SHORT" | "NO TRADE" = "NO TRADE";

    if (blockers.length === 0 && detectedSweep && displacement) {
      direction = isLong ? "LONG" : "SHORT";
      if (qualityScore >= 80 && fibZone?.inOteZone && isMacroAligned) {
        setupGrade = "A+";
      } else if (qualityScore >= 65) {
        setupGrade = "A";
      } else {
        setupGrade = "B";
      }
    }

    const invalidation = isLong
      ? `15M candle close below protected sweep low at $${fmt(stopLossModel.stopLossPrice)}`
      : `15M candle close above protected sweep high at $${fmt(stopLossModel.stopLossPrice)}`;

    const summary =
      direction === "NO TRADE"
        ? `No Institutional OTE setup currently active for ${symbol}. ${blockers[0] || "Market is consolidating in equilibrium."} Capital preservation is prioritized.`
        : `Institutional ${setupGrade}-Grade ${direction} setup identified. Purged ${detectedSweep?.levelType} liquidity at $${fmt(detectedSweep?.price || 0)}, confirmed displacement, and offering ${entryModel.type} targeting $${fmt(targetsModel.tp2.price)} (${targetsModel.tp2.rMultiple}R net).`;

    return {
      symbol,
      timeframe,
      generatedAt: new Date().toISOString(),
      direction,
      setupGrade,
      qualityScore: Math.min(100, qualityScore),
      htfBias: macroBias,
      marketRegime: `${macroBias}_OTE_CYCLE`,
      currentPrice,
      sweep: detectedSweep,
      displacement,
      fibZone,
      entry: entryModel,
      stopLoss: stopLossModel,
      targets: targetsModel,
      reasons,
      blockers,
      warnings,
      context,
      summary,
      invalidation,
      indicators: {
        rsi: Number(indTrigger.rsi.toFixed(1)),
        atr: roundToTick(atrTrigger, currentPrice),
        volumeRatio: Number(indTrigger.volume.ratio.toFixed(2)),
        trend: indSetup.trend,
      },
      dataSource: exchangeInfo,
      candles: candlesTrigger.slice(-80),
    };
  }
}

function fmt(n: number): string {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
}
