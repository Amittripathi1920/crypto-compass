import type { Candle } from "../indicators";
import { SignalEngine } from "./SignalEngine";
import type { PartialEngineConfig, EntryType } from "./types";
import { DEFAULT_CONFIG, validateEngineConfig } from "./config";

export type BacktestTrade = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryType: EntryType;
  entryTime: number;
  closeTime: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  grossRMultiple: number;
  netRMultiple: number;
  feesPaid: number;
  slippagePaid: number;
  result: "WIN" | "LOSS" | "BE";
  marketRegime: string;
  setupType: string;
  durationCandles: number;
  // Legacy compatibility
  rMultiple: number;
};

export type BacktestResult = {
  symbol: string;
  timeframe: string;
  startTime: number;
  endTime: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  grossProfitFactor: number;
  maxDrawdown: number;
  expectancy: number;
  sharpeRatio: number;
  tradeSharpe: number;
  totalFees: number;
  evaluatedCandles: number;
  errorCount: number;
  dataIntegrityPct: number;
  trades: BacktestTrade[];
};

export type ActiveTradeState = {
  direction: "LONG" | "SHORT";
  entryType: EntryType;
  entry: number;
  entryZoneMin: number;
  entryZoneMax: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  entryTime: number;
  status: "PENDING" | "ACTIVE" | "TP1_HIT";
  trailingSl: number;
  setupType: string;
  marketRegime: string;
  candleCounter: number;
  expirationCandles: number;
};

export class BacktestEngine {
  public static run(
    symbol: string,
    timeframe: string,
    candles1d: Candle[],
    candles4h: Candle[],
    candles1h: Candle[],
    candles15m: Candle[],
    candles5m: Candle[],
    rawConfig?: PartialEngineConfig | undefined,
  ): BacktestResult {
    const config = validateEngineConfig(rawConfig);
    const trades: BacktestTrade[] = [];

    const startTime = candles15m[0]?.time ?? 0;
    const endTime = candles15m[candles15m.length - 1]?.time ?? 0;

    if (candles15m.length < 60 || candles5m.length < 100) {
      return {
        symbol,
        timeframe,
        startTime,
        endTime,
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        grossProfitFactor: 0,
        maxDrawdown: 0,
        expectancy: 0,
        sharpeRatio: 0,
        tradeSharpe: 0,
        totalFees: 0,
        evaluatedCandles: 0,
        errorCount: 0,
        dataIntegrityPct: 100,
        trades: [],
      };
    }

    const startIdx = Math.max(50, Math.floor(candles15m.length * 0.2));
    const endIdx = candles15m.length - 10;

    let activeTrade: ActiveTradeState | null = null;
    let evaluatedCandles = 0;
    let errorCount = 0;

    // Pointer indices for fast $O(N)$ slicing
    let ptr1d = 0;
    let ptr4h = 0;
    let ptr1h = 0;
    let ptr5m = 0;

    for (let i = startIdx; i < endIdx; i++) {
      const currentCandle = candles15m[i]!;
      const T = currentCandle.time;
      evaluatedCandles++;

      // Advance pointer indices up to time T
      while (ptr1d < candles1d.length && candles1d[ptr1d]!.time <= T) ptr1d++;
      while (ptr4h < candles4h.length && candles4h[ptr4h]!.time <= T) ptr4h++;
      while (ptr1h < candles1h.length && candles1h[ptr1h]!.time <= T) ptr1h++;
      while (ptr5m < candles5m.length && candles5m[ptr5m]!.time <= T) ptr5m++;

      const slice1d = candles1d.slice(0, ptr1d);
      const slice4h = candles4h.slice(0, ptr4h);
      const slice1h = candles1h.slice(0, ptr1h);
      const slice15m = candles15m.slice(0, i + 1);
      const slice5m = candles5m.slice(0, ptr5m);

      // Subsequent 5M execution stream corresponding to this 15M bar (up to next 15M candle)
      const nextT = candles15m[i + 1]?.time ?? T + 15 * 60 * 1000;
      const sub5mCandles = candles5m.filter((c) => c.time >= T && c.time < nextT);

      // Step trade lifecycle across 5M micro-candles
      for (const m5 of sub5mCandles) {
        if (!activeTrade) break;

        const isLong = activeTrade.direction === "LONG";
        activeTrade.candleCounter++;

        // 1. Pending Order Execution Check
        if (activeTrade.status === "PENDING") {
          // Check expiration
          if (activeTrade.candleCounter > activeTrade.expirationCandles * 3) {
            activeTrade = null;
            continue;
          }

          let hitEntry = false;
          let hitStopBeforeEntry = false;

          if (activeTrade.entryType === "MARKET") {
            hitEntry = true;
          } else if (activeTrade.entryType === "LIMIT") {
            hitEntry = isLong
              ? m5.low <= activeTrade.entry
              : m5.high >= activeTrade.entry;
            hitStopBeforeEntry = isLong
              ? m5.low <= activeTrade.stopLoss
              : m5.high >= activeTrade.stopLoss;
          } else if (activeTrade.entryType === "BREAKOUT") {
            hitEntry = isLong
              ? m5.high >= activeTrade.entry
              : m5.low <= activeTrade.entry;
          } else {
            hitEntry = isLong
              ? m5.low <= activeTrade.entry
              : m5.high >= activeTrade.entry;
          }

          if (hitStopBeforeEntry && !hitEntry) {
            activeTrade = null;
            continue;
          } else if (hitEntry) {
            activeTrade.status = "ACTIVE";
          }
        }

        // 2. Active Trade Tracking on 5M Stream
        if (activeTrade && activeTrade.status === "ACTIVE") {
          const hitStop = isLong
            ? m5.low <= activeTrade.stopLoss
            : m5.high >= activeTrade.stopLoss;
          const hitTP1 = isLong
            ? m5.high >= activeTrade.tp1
            : m5.low <= activeTrade.tp1;

          if (hitStop && hitTP1) {
            // Intrabar resolution: check open vs stop/tp1 distance
            const closerToStop = Math.abs(m5.open - activeTrade.stopLoss) < Math.abs(m5.open - activeTrade.tp1);
            if (closerToStop) {
              trades.push(this.recordTrade(symbol, activeTrade, m5.time, activeTrade.stopLoss, "LOSS", -1.0, config));
              activeTrade = null;
            } else {
              activeTrade.status = "TP1_HIT";
              activeTrade.trailingSl = activeTrade.entry;
            }
          } else if (hitStop) {
            trades.push(this.recordTrade(symbol, activeTrade, m5.time, activeTrade.stopLoss, "LOSS", -1.0, config));
            activeTrade = null;
          } else if (hitTP1) {
            activeTrade.status = "TP1_HIT";
            activeTrade.trailingSl = activeTrade.entry;
          }
        }

        // 3. TP1 Hit: Trailing to BE and targeting TP2
        if (activeTrade && activeTrade.status === "TP1_HIT") {
          const hitBE = isLong
            ? m5.low <= activeTrade.trailingSl
            : m5.high >= activeTrade.trailingSl;
          const hitTP2 = isLong
            ? m5.high >= activeTrade.tp2
            : m5.low <= activeTrade.tp2;

          const risk = Math.max(Math.abs(activeTrade.entry - activeTrade.stopLoss), 0.0001);
          const rTP1 = Math.abs(activeTrade.tp1 - activeTrade.entry) / risk;
          const rTP2 = Math.abs(activeTrade.tp2 - activeTrade.entry) / risk;

          if (hitBE && hitTP2) {
            // Scale out: 50% at TP1, 50% at TP2
            const totalR = rTP1 * 0.5 + rTP2 * 0.5;
            trades.push(this.recordTrade(symbol, activeTrade, m5.time, activeTrade.tp2, "WIN", totalR, config));
            activeTrade = null;
          } else if (hitBE) {
            // 50% at TP1, 50% at BE
            const totalR = rTP1 * 0.5;
            trades.push(this.recordTrade(symbol, activeTrade, m5.time, activeTrade.trailingSl, "BE", totalR, config));
            activeTrade = null;
          } else if (hitTP2) {
            const totalR = rTP1 * 0.5 + rTP2 * 0.5;
            trades.push(this.recordTrade(symbol, activeTrade, m5.time, activeTrade.tp2, "WIN", totalR, config));
            activeTrade = null;
          }
        }
      }

      // If flat, evaluate SignalEngine for new setups
      if (!activeTrade) {
        try {
          const signal = SignalEngine.run(
            symbol,
            slice1d,
            slice4h,
            slice1h,
            slice15m,
            slice5m,
            currentCandle.close,
            config,
          );

          if (signal.direction === "LONG" || signal.direction === "SHORT") {
            activeTrade = {
              direction: signal.direction,
              entryType: signal.entryType,
              entry: signal.entry,
              entryZoneMin: signal.entryZone.min,
              entryZoneMax: signal.entryZone.max,
              stopLoss: signal.stopLoss,
              tp1: signal.takeProfit.tp1,
              tp2: signal.takeProfit.tp2,
              tp3: signal.takeProfit.tp3,
              entryTime: T,
              status: signal.entryType === "MARKET" ? "ACTIVE" : "PENDING",
              trailingSl: signal.stopLoss,
              setupType: signal.setupType.join("+") || "STRUCTURE",
              marketRegime: signal.marketRegime,
              candleCounter: 0,
              expirationCandles: signal.expirationCandles,
            };
          }
        } catch {
          errorCount++;
        }
      }
    }

    return this.calculateMetrics(
      symbol,
      timeframe,
      candles15m[startIdx]!.time,
      candles15m[endIdx]!.time,
      trades,
      evaluatedCandles,
      errorCount,
    );
  }

  private static recordTrade(
    symbol: string,
    trade: ActiveTradeState,
    closeTime: number,
    exitPrice: number,
    result: "WIN" | "LOSS" | "BE",
    grossR: number,
    config: ReturnType<typeof validateEngineConfig>,
  ): BacktestTrade {
    const risk = Math.max(Math.abs(trade.entry - trade.stopLoss), 0.0001);
    const stopPct = risk / trade.entry;

    // Fees in R-multiple: 2 taker/maker executions + slippage
    const feePct = (config.takerFeeBps + config.makerFeeBps + config.slippageBps * 2) / 10000;
    const feeInR = stopPct > 0 ? feePct / stopPct : 0.05;

    const netR = grossR > 0 ? Math.max(0, grossR - feeInR) : grossR - feeInR;
    const feesPaid = Number((1000 * 0.01 * feeInR).toFixed(2));
    const slippagePaid = Number((1000 * 0.01 * (config.slippageBps / 10000 / stopPct)).toFixed(2));

    return {
      id: `bt_${trade.entryTime}`,
      symbol,
      direction: trade.direction,
      entryType: trade.entryType,
      entryTime: trade.entryTime,
      closeTime,
      entryPrice: trade.entry,
      exitPrice,
      stopLoss: trade.stopLoss,
      tp1: trade.tp1,
      tp2: trade.tp2,
      tp3: trade.tp3,
      grossRMultiple: Number(grossR.toFixed(2)),
      netRMultiple: Number(netR.toFixed(2)),
      feesPaid,
      slippagePaid,
      result,
      marketRegime: trade.marketRegime,
      setupType: trade.setupType,
      durationCandles: Math.max(1, Math.round((closeTime - trade.entryTime) / (5 * 60 * 1000))),
      rMultiple: Number(netR.toFixed(2)), // Legacy alias points to Net R
    };
  }

  private static calculateMetrics(
    symbol: string,
    timeframe: string,
    startTime: number,
    endTime: number,
    trades: BacktestTrade[],
    evaluatedCandles: number,
    errorCount: number,
  ): BacktestResult {
    const totalTrades = trades.length;
    const dataIntegrityPct =
      evaluatedCandles > 0
        ? Number((((evaluatedCandles - errorCount) / evaluatedCandles) * 100).toFixed(1))
        : 100;

    if (totalTrades === 0) {
      return {
        symbol,
        timeframe,
        startTime,
        endTime,
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        grossProfitFactor: 0,
        maxDrawdown: 0,
        expectancy: 0,
        sharpeRatio: 0,
        tradeSharpe: 0,
        totalFees: 0,
        evaluatedCandles,
        errorCount,
        dataIntegrityPct,
        trades: [],
      };
    }

    const wins = trades.filter((t) => t.result === "WIN");
    const winRate = Number(((wins.length / totalTrades) * 100).toFixed(1));

    const grossWins = trades
      .filter((t) => t.grossRMultiple > 0)
      .reduce((sum, t) => sum + t.grossRMultiple, 0);
    const grossLosses = Math.abs(
      trades.filter((t) => t.grossRMultiple < 0).reduce((sum, t) => sum + t.grossRMultiple, 0),
    );
    const grossProfitFactor =
      grossLosses === 0 ? grossWins : Number((grossWins / grossLosses).toFixed(2));

    const netWins = trades
      .filter((t) => t.netRMultiple > 0)
      .reduce((sum, t) => sum + t.netRMultiple, 0);
    const netLosses = Math.abs(
      trades.filter((t) => t.netRMultiple < 0).reduce((sum, t) => sum + t.netRMultiple, 0),
    );
    const netProfitFactor =
      netLosses === 0 ? netWins : Number((netWins / netLosses).toFixed(2));

    const totalFees = Number(trades.reduce((sum, t) => sum + t.feesPaid, 0).toFixed(2));

    let balance = 1000;
    let maxBalance = balance;
    let maxDrawdown = 0;

    trades.forEach((t) => {
      const tradeRisk = 10;
      balance += t.netRMultiple * tradeRisk;
      if (balance > maxBalance) {
        maxBalance = balance;
      }
      const dd = ((maxBalance - balance) / maxBalance) * 100;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }
    });

    const expectancy = Number(
      (trades.reduce((sum, t) => sum + t.netRMultiple, 0) / totalTrades).toFixed(2),
    );

    const netRMultiples = trades.map((t) => t.netRMultiple);
    const avgR = netRMultiples.reduce((a, b) => a + b, 0) / totalTrades;
    const variance =
      netRMultiples.reduce((sum, r) => sum + Math.pow(r - avgR, 2), 0) / totalTrades;
    const stdDev = Math.sqrt(variance) || 1;
    const tradeSharpe = Number((avgR / stdDev).toFixed(2));
    const annualizedSharpe = Number(((avgR / stdDev) * Math.sqrt(365)).toFixed(2));

    return {
      symbol,
      timeframe,
      startTime,
      endTime,
      totalTrades,
      winRate,
      profitFactor: netProfitFactor,
      grossProfitFactor,
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
      expectancy,
      sharpeRatio: annualizedSharpe,
      tradeSharpe,
      totalFees,
      evaluatedCandles,
      errorCount,
      dataIntegrityPct,
      trades,
    };
  }
}
