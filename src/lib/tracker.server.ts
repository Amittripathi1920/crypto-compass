import { fetchCandles, fetchTicker } from "./market.server";
import type { TrackedTrade, TradeStatus } from "./tracker-types";
import type { Candle } from "./indicators";

export function validateTradeHistory(trade: TrackedTrade, candles: Candle[]): TrackedTrade {
  // Sort candles ascending by time to scan chronologically
  const sorted = [...candles].sort((a, b) => a.time - b.time);

  // Only process candles that start after or at the exact entryTime.
  // This prevents wicks that occurred BEFORE the user tracked the trade (but within the same active candle block)
  // from triggering a false fill.
  const relevantCandles = sorted.filter((c) => c.time >= trade.entryTime);

  let currentStatus = trade.status;
  let fillTime = trade.fillTime;
  let closeTime = trade.closeTime;
  const history = [...trade.history];

  const addLog = (status: TradeStatus, price: number, detail: string, time: number) => {
    currentStatus = status;
    history.push({ time, status, price, detail });
  };

  const isLong = trade.direction === "LONG";

  for (const c of relevantCandles) {
    if (
      currentStatus === "SL_HIT" ||
      currentStatus === "TP2_HIT" ||
      currentStatus === "BE_HIT" ||
      currentStatus === "CANCELLED" ||
      currentStatus === "MISSED"
    ) {
      break;
    }

    if (currentStatus === "PENDING") {
      // Check if price touched Stop Loss before/without entry fill
      const hitStop = isLong ? c.low <= trade.stopLoss : c.high >= trade.stopLoss;
      const hitEntry = isLong ? c.low <= trade.entry : c.high >= trade.entry;

      if (hitStop && !hitEntry) {
        closeTime = c.time;
        addLog(
          "MISSED",
          trade.stopLoss,
          `Stop Loss level ($${trade.stopLoss.toLocaleString()}) touched before Entry ($${trade.entry.toLocaleString()}) was filled. Trade setup invalidated (no fill).`,
          c.time
        );
        break;
      }

      // Check if price touched Entry to fill the limit order
      if (hitEntry) {
        fillTime = c.time;
        addLog("ACTIVE", trade.entry, `Limit order filled at $${trade.entry.toLocaleString()}`, c.time);
      } else {
        continue;
      }
    }

    if (currentStatus === "ACTIVE") {
      const hitStop = isLong ? c.low <= trade.stopLoss : c.high >= trade.stopLoss;
      const hitT1 = isLong ? c.high >= trade.target1 : c.low <= trade.target1;

      if (hitStop && hitT1) {
        // Conservative assumption: hit stop loss first
        closeTime = c.time;
        const lossVal = trade.balance * trade.leverage * (Math.abs(trade.entry - trade.stopLoss) / trade.entry);
        addLog(
          "SL_HIT",
          trade.stopLoss,
          `Stop Loss hit at $${trade.stopLoss.toLocaleString()} (Estimated Loss: -$${lossVal.toFixed(2)})`,
          c.time
        );
        break;
      } else if (hitStop) {
        closeTime = c.time;
        const lossVal = trade.balance * trade.leverage * (Math.abs(trade.entry - trade.stopLoss) / trade.entry);
        addLog(
          "SL_HIT",
          trade.stopLoss,
          `Stop Loss hit at $${trade.stopLoss.toLocaleString()} (Estimated Loss: -$${lossVal.toFixed(2)})`,
          c.time
        );
        break;
      } else if (hitT1) {
        addLog(
          "TP1_HIT",
          trade.target1,
          `Target 1 reached at $${trade.target1.toLocaleString()}. Secured 50% profit. Stop Loss trailed to Break-Even ($${trade.entry.toLocaleString()}).`,
          c.time
        );
      }
    }

    if (currentStatus === "TP1_HIT") {
      const hitT2 = isLong ? c.high >= trade.target2 : c.low <= trade.target2;
      const hitBE = isLong ? c.low <= trade.entry : c.high >= trade.entry;

      if (hitBE && hitT2) {
        // Conservative assumption: hit break-even first
        closeTime = c.time;
        addLog(
          "BE_HIT",
          trade.entry,
          `Position closed at Break-Even stop ($${trade.entry.toLocaleString()}) after wicking back.`,
          c.time
        );
        break;
      } else if (hitBE) {
        closeTime = c.time;
        addLog(
          "BE_HIT",
          trade.entry,
          `Position closed at Break-Even stop ($${trade.entry.toLocaleString()}).`,
          c.time
        );
        break;
      } else if (hitT2) {
        closeTime = c.time;
        addLog(
          "TP2_HIT",
          trade.target2,
          `Target 2 reached at $${trade.target2.toLocaleString()}. Position fully closed in profit.`,
          c.time
        );
        break;
      }
    }
  }

  return {
    ...trade,
    status: currentStatus,
    fillTime,
    closeTime,
    history,
  };
}

function getTimeframeMs(tf: string): number {
  switch (tf) {
    case "4h": return 4 * 60 * 60 * 1000;
    case "8h": return 8 * 60 * 60 * 1000;
    case "1d": return 24 * 60 * 60 * 1000;
    case "1w": return 7 * 24 * 60 * 60 * 1000;
    default: return 4 * 60 * 60 * 1000;
  }
}

export async function validateActiveTrades(trades: TrackedTrade[]): Promise<TrackedTrade[]> {
  const uniqueSymbols = Array.from(new Set(trades.map((t) => t.symbol)));
  const priceMap = new Map<string, number>();

  await Promise.all(
    uniqueSymbols.map(async (sym) => {
      try {
        const res = await fetchTicker(sym);
        if (res.value?.price) {
          priceMap.set(sym, res.value.price);
        }
      } catch (e) {
        console.error(`[tracker] Failed to fetch ticker for ${sym}:`, e);
      }
    })
  );

  const results: TrackedTrade[] = [];
  for (const trade of trades) {
    const livePrice = priceMap.get(trade.symbol);

    // If trade is already completed, just update its currentPrice and push it
    if (
      trade.status === "SL_HIT" ||
      trade.status === "TP2_HIT" ||
      trade.status === "BE_HIT" ||
      trade.status === "CANCELLED" ||
      trade.status === "MISSED"
    ) {
      const updated = { ...trade };
      if (livePrice !== undefined) {
        updated.currentPrice = livePrice;
      }
      results.push(updated);
      continue;
    }

    try {
      const res = await fetchCandles(trade.symbol, trade.timeframe);
      const updated = validateTradeHistory(trade, res.value);
      
      if (livePrice !== undefined) {
        updated.currentPrice = livePrice;
      } else {
        const lastCandle = res.value[res.value.length - 1];
        if (lastCandle) {
          updated.currentPrice = lastCandle.close;
        }
      }
      results.push(updated);
    } catch (e) {
      console.error(`[tracker] Failed to validate ${trade.symbol} trade:`, e);
      const updated = { ...trade };
      if (livePrice !== undefined) {
        updated.currentPrice = livePrice;
      }
      results.push(updated);
    }
  }
  return results;
}
