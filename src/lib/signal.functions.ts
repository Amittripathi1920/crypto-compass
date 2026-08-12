import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  symbol: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/),
  timeframe: z.enum(["5m", "15m", "1h", "4h", "8h", "1d", "1w"]),
  provider: z.enum(["lovable", "openai", "anthropic", "google", "groq"]),
  model: z.string().max(80).optional(),
  apiKey: z.string().max(300).optional(),
  config: z.any().optional(),
});

export const analyzeCoin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { generateSignal } = await import("./signal.server");
    return generateSignal(data as any);
  });

export const getLivePrice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        symbol: z
          .string()
          .min(2)
          .max(10)
          .regex(/^[A-Z0-9]+$/),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchTicker } = await import("./market.server");
    const res = await fetchTicker(data.symbol);
    return { ...res.value, source: res.source };
  });

export const getPatternAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        symbol: z
          .string()
          .min(2)
          .max(10)
          .regex(/^[A-Z0-9]+$/),
        timeframe: z.enum(["5m", "15m", "1h", "4h", "8h", "1d", "1w"]),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { generatePatternAnalysis } = await import("./signal.server");
    return generatePatternAnalysis(data.symbol, data.timeframe);
  });

// Backtesting server functions
const BacktestInputSchema = z.object({
  symbol: z.string().min(2).max(10),
  timeframe: z.enum(["5m", "15m", "1h", "4h", "8h", "1d", "1w"]),
  config: z.any().optional(),
});

export const runHistoricalBacktest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BacktestInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { fetchCandles } = await import("./market.server");
    const { BacktestEngine } = await import("./engine/BacktestEngine");
    const { DEFAULT_CONFIG } = await import("./engine/config");
    const { db } = await import("./db");
    const { backtestRuns, backtestTrades } = await import("./db/schema");
    
    // Fetch candles in parallel
    const [c1d, c4h, c1h, c15m, c5m] = await Promise.all([
      fetchCandles(data.symbol, "1d"),
      fetchCandles(data.symbol, "4h"),
      fetchCandles(data.symbol, "1h"),
      fetchCandles(data.symbol, "15m"),
      fetchCandles(data.symbol, "5m"),
    ]);

    const config = {
      ...DEFAULT_CONFIG,
      ...(data.config || {})
    };

    const result = BacktestEngine.run(
      data.symbol,
      data.timeframe,
      c1d.value,
      c4h.value,
      c1h.value,
      c15m.value,
      c5m.value,
      config
    );

    // Persist backtest run to database
    try {
      const runId = `run_${Date.now()}`;
      await db.insert(backtestRuns).values({
        id: runId,
        symbol: data.symbol,
        timeframe: data.timeframe,
        startTime: result.startTime,
        endTime: result.endTime,
        totalTrades: result.totalTrades,
        winRate: result.winRate,
        profitFactor: result.profitFactor,
        maxDrawdown: result.maxDrawdown,
        expectancy: result.expectancy,
        sharpeRatio: result.sharpeRatio,
      });

      if (result.trades.length > 0) {
        // Insert up to 50 trades to database to prevent giant payload queries
        const tradesToInsert = result.trades.slice(-50).map((t) => ({
          id: `${runId}_${t.entryTime}`,
          runId,
          symbol: t.symbol,
          direction: t.direction,
          entryTime: t.entryTime,
          closeTime: t.closeTime,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          stopLoss: t.stopLoss,
          takeProfit1: t.tp1,
          takeProfit2: t.tp2,
          takeProfit3: t.tp3,
          rMultiple: t.rMultiple,
          result: t.result,
          marketRegime: t.marketRegime,
          setupType: t.setupType,
        }));
        await db.insert(backtestTrades).values(tradesToInsert);
      }
    } catch (e) {
      console.error("[backtest] Failed to save run to database:", e);
    }

    return result;
  });

export const getBacktestHistory = createServerFn({ method: "POST" })
  .handler(async () => {
    const { db } = await import("./db");
    const { backtestRuns } = await import("./db/schema");
    const { desc } = await import("drizzle-orm");
    try {
      const rows = await db
        .select()
        .from(backtestRuns)
        .orderBy(desc(backtestRuns.runTime))
        .limit(10);
      return rows;
    } catch (e) {
      console.error("[backtest] Failed to fetch history from database:", e);
      return [];
    }
  });
