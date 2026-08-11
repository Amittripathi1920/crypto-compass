import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_technical_indicators",
  title: "Get technical indicators",
  description:
    "Compute RSI, MACD, EMA 20/50/200, ATR, swing high/low, trend and volume readings from live candles for a symbol and timeframe.",
  inputSchema: {
    symbol: z.string().describe("Coin symbol in upper case, e.g. BTC."),
    timeframe: z.enum(["4h", "8h", "1d", "1w"]).describe("Candle timeframe."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ symbol, timeframe }) => {
    const clean = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(clean)) throw new ToolError("Invalid symbol format.");
    const { fetchCandles } = await import("../../market.server");
    const { computeIndicators, determineRegime } = await import("../../indicators");
    const res = await fetchCandles(clean, timeframe);
    const ind = computeIndicators(res.value);
    const payload = {
      symbol: clean,
      timeframe,
      source: res.source,
      price: ind.price,
      marketRegime: determineRegime(ind),
      rsi14: Number(ind.rsi.toFixed(2)),
      macd: ind.macd,
      ema20: ind.ema20,
      ema50: ind.ema50,
      ema200: ind.ema200,
      atr14: ind.atr,
      atrPctOfPrice: Number(ind.atrPct.toFixed(2)),
      swingHigh: ind.swingHigh,
      swingLow: ind.swingLow,
      trend: ind.trend,
      volume: ind.volume,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});