import type { Candle } from "../indicators";
import { SignalEngine } from "./SignalEngine";
import type { EngineConfig, SetupType } from "./types";
import { DEFAULT_CONFIG } from "./config";

export type BacktestTrade = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryTime: number;
  closeTime: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rMultiple: number;
  result: "WIN" | "LOSS" | "BE";
  marketRegime: string;
  setupType: string;
};

export type BacktestResult = {
  symbol: string;
  timeframe: string;
  startTime: number;
  endTime: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  expectancy: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
};

export type ActiveTradeState = {
  direction: "LONG" | "SHORT";
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  entryTime: number;
  status: "PENDING" | "ACTIVE" | "TP1_HIT";
  trailingSl: number;
  setupType: string;
  marketRegime: string;
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
    config: EngineConfig = DEFAULT_CONFIG
  ): BacktestResult {
    const trades: BacktestTrade[] = [];
    
    // We step through the 15M candles. To simulate realistic analysis,
    // we need enough history behind each step for indicators to compile.
    // Let's start from index 50 to 250 (out of 300).
    const startIdx = Math.max(50, Math.floor(candles15m.length * 0.2));
    const endIdx = candles15m.length - 20; // Leave 20 candles at the end for tracking trade resolution

    let activeTrade: {
      direction: "LONG" | "SHORT";
      entry: number;
      stopLoss: number;
      tp1: number;
      tp2: number;
      tp3: number;
      entryTime: number;
      status: "PENDING" | "ACTIVE" | "TP1_HIT";
      trailingSl: number;
      setupType: string;
      marketRegime: string;
    } | null = null;

    for (let i = startIdx; i < endIdx; i++) {
      const currentCandle = candles15m[i]!;
      const T = currentCandle.time;

      // Slice historical data up to T (close of current candle)
      const slice1d = candles1d.filter((c) => c.time <= T);
      const slice4h = candles4h.filter((c) => c.time <= T);
      const slice1h = candles1h.filter((c) => c.time <= T);
      const slice15m = candles15m.slice(0, i + 1);
      const slice5m = candles5m.filter((c) => c.time <= T);

      // If we have an active trade, track its resolution using current candle's wicks
      if (activeTrade) {
        const isLong = activeTrade.direction === "LONG";
        
        if (activeTrade.status === "PENDING") {
          // Check for entry fill
          const hitEntry = isLong ? currentCandle.low <= activeTrade.entry : currentCandle.high >= activeTrade.entry;
          const hitStop = isLong ? currentCandle.low <= activeTrade.stopLoss : currentCandle.high >= activeTrade.stopLoss;
          
          if (hitStop && !hitEntry) {
            // Cancelled/missed
            activeTrade = null;
          } else if (hitEntry) {
            activeTrade.status = "ACTIVE";
          }
        }

        if (activeTrade && activeTrade.status === "ACTIVE") {
          // Check for TP1 or SL hit
          const hitStop = isLong ? currentCandle.low <= activeTrade.stopLoss : currentCandle.high >= activeTrade.stopLoss;
          const hitTP1 = isLong ? currentCandle.high >= activeTrade.tp1 : currentCandle.low <= activeTrade.tp1;

          if (hitStop && hitTP1) {
            // Conservative: hit SL
            trades.push(
              this.closeTrade(symbol, activeTrade, currentCandle.time, activeTrade.stopLoss, "LOSS", -1.0)
            );
            activeTrade = null;
          } else if (hitStop) {
            trades.push(
              this.closeTrade(symbol, activeTrade, currentCandle.time, activeTrade.stopLoss, "LOSS", -1.0)
            );
            activeTrade = null;
          } else if (hitTP1) {
            // TP1 hit: lock in 50% profit, trail Stop Loss to break-even (entry)
            activeTrade.status = "TP1_HIT";
            activeTrade.trailingSl = activeTrade.entry;
          }
        }

        if (activeTrade && activeTrade.status === "TP1_HIT") {
          // Track 2nd half of trade
          const hitBE = isLong ? currentCandle.low <= activeTrade.trailingSl : currentCandle.high >= activeTrade.trailingSl;
          const hitTP2 = isLong ? currentCandle.high >= activeTrade.tp2 : currentCandle.low <= activeTrade.tp2;

          if (hitBE && hitTP2) {
            // Conservative: hit BE
            const rMultiplier = (activeTrade.tp1 - activeTrade.entry) / (activeTrade.entry - activeTrade.stopLoss);
            trades.push(
              this.closeTrade(symbol, activeTrade, currentCandle.time, activeTrade.trailingSl, "BE", Number((rMultiplier * 0.5).toFixed(2)))
            );
            activeTrade = null;
          } else if (hitBE) {
            const rMultiplier = (activeTrade.tp1 - activeTrade.entry) / (activeTrade.entry - activeTrade.stopLoss);
            trades.push(
              this.closeTrade(symbol, activeTrade, currentCandle.time, activeTrade.trailingSl, "BE", Number((rMultiplier * 0.5).toFixed(2)))
            );
            activeTrade = null;
          } else if (hitTP2) {
            const rMultiplier1 = (activeTrade.tp1 - activeTrade.entry) / (activeTrade.entry - activeTrade.stopLoss);
            const rMultiplier2 = (activeTrade.tp2 - activeTrade.entry) / (activeTrade.entry - activeTrade.stopLoss);
            const totalR = (rMultiplier1 * 0.5) + (rMultiplier2 * 0.5);
            trades.push(
              this.closeTrade(symbol, activeTrade, currentCandle.time, activeTrade.tp2, "WIN", Number(totalR.toFixed(2)))
            );
            activeTrade = null;
          }
        }
      }

      // If no active trade, run SignalEngine to scan for new entries
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
            config
          );

          if (signal.direction === "LONG" || signal.direction === "SHORT") {
            activeTrade = {
              direction: signal.direction,
              entry: signal.entry,
              stopLoss: signal.stopLoss,
              tp1: signal.takeProfit.tp1,
              tp2: signal.takeProfit.tp2,
              tp3: signal.takeProfit.tp3,
              entryTime: T,
              status: "PENDING",
              trailingSl: signal.stopLoss,
              setupType: signal.setupType.join("+"),
              marketRegime: signal.marketRegime
            };
          }
        } catch (e) {
          // Fail silently during iterations
        }
      }
    }

    return this.calculateMetrics(symbol, timeframe, candles15m[startIdx]!.time, candles15m[endIdx]!.time, trades);
  }

  private static closeTrade(
    symbol: string,
    trade: ActiveTradeState,
    closeTime: number,
    exitPrice: number,
    result: "WIN" | "LOSS" | "BE",
    rMultiple: number
  ): BacktestTrade {
    return {
      id: `bt_${trade.entryTime}`,
      symbol,
      direction: trade.direction,
      entryTime: trade.entryTime,
      closeTime,
      entryPrice: trade.entry,
      exitPrice,
      stopLoss: trade.stopLoss,
      tp1: trade.tp1,
      tp2: trade.tp2,
      tp3: trade.tp3,
      rMultiple,
      result,
      marketRegime: trade.marketRegime,
      setupType: trade.setupType
    };
  }

  private static calculateMetrics(
    symbol: string,
    timeframe: string,
    startTime: number,
    endTime: number,
    trades: BacktestTrade[]
  ): BacktestResult {
    const totalTrades = trades.length;
    if (totalTrades === 0) {
      return {
        symbol,
        timeframe,
        startTime,
        endTime,
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        expectancy: 0,
        sharpeRatio: 0,
        trades: []
      };
    }

    const wins = trades.filter((t) => t.result === "WIN");
    const losses = trades.filter((t) => t.result === "LOSS");
    const winRate = Number(((wins.length / totalTrades) * 100).toFixed(1));

    // Profit Factor: sum of positive R / sum of negative R
    const grossWins = trades.filter((t) => t.rMultiple > 0).reduce((sum, t) => sum + t.rMultiple, 0);
    const grossLosses = Math.abs(trades.filter((t) => t.rMultiple < 0).reduce((sum, t) => sum + t.rMultiple, 0));
    const profitFactor = grossLosses === 0 ? grossWins : Number((grossWins / grossLosses).toFixed(2));

    // Drawdown and equity calculations
    let balance = 1000;
    const balanceHistory: number[] = [balance];
    let maxBalance = balance;
    let maxDrawdown = 0;

    trades.forEach((t) => {
      // Assume 1% risk per trade ($10 risk)
      const tradeRisk = 10;
      balance += t.rMultiple * tradeRisk;
      balanceHistory.push(balance);
      
      if (balance > maxBalance) {
        maxBalance = balance;
      }
      
      const dd = ((maxBalance - balance) / maxBalance) * 100;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }
    });

    // Expectancy: WinRate * avgWin - LossRate * avgLoss
    const expectancy = Number((trades.reduce((sum, t) => sum + t.rMultiple, 0) / totalTrades).toFixed(2));

    // Sharpe ratio of R multiples
    const rMultiples = trades.map((t) => t.rMultiple);
    const avgR = rMultiples.reduce((a, b) => a + b, 0) / totalTrades;
    const variance = rMultiples.reduce((sum, r) => sum + Math.pow(r - avgR, 2), 0) / totalTrades;
    const stdDev = Math.sqrt(variance) || 1;
    const sharpeRatio = Number((avgR / stdDev * Math.sqrt(252)).toFixed(2)); // annualized scaling assuming ~1 trade/day average

    return {
      symbol,
      timeframe,
      startTime,
      endTime,
      totalTrades,
      winRate,
      profitFactor,
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
      expectancy,
      sharpeRatio,
      trades
    };
  }
}
