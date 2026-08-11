import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "analyze_trade_signal",
  title: "Analyze trade signal",
  description:
    "Run the full analysis for a symbol and timeframe: LONG / SHORT / NO TRADE verdict with confidence, entry, stop loss, two targets, risk-reward and written reasoning.",
  inputSchema: {
    symbol: z.string().describe("Coin symbol in upper case, e.g. BTC."),
    timeframe: z.enum(["4h", "8h", "1d", "1w"]).describe("Analysis timeframe."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ symbol, timeframe }) => {
    const clean = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(clean)) throw new ToolError("Invalid symbol format.");
    const { generateSignal } = await import("../../signal.server");
    const r = await generateSignal({ symbol: clean, timeframe, provider: "lovable" });
    const payload = {
      symbol: r.symbol,
      timeframe: r.timeframe,
      generatedAt: r.generatedAt,
      currentPrice: r.currentPrice,
      marketRegime: r.marketRegime,
      sentiment: r.sentiment,
      direction: r.direction,
      confidence: r.confidence,
      entry: r.entry,
      stopLoss: r.stopLoss,
      target1: r.target1,
      target2: r.target2,
      riskReward: r.riskReward,
      summary: r.summary,
      reasoning: r.reasoning,
      invalidation: r.invalidation,
      indicators: r.indicators,
      dataSource: { candles: r.dataSource.candles, ticker: r.dataSource.ticker },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});