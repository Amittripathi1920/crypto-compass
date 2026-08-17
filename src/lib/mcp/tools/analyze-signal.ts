import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { Timeframe } from "../../coins";

export default defineTool({
  name: "analyze_trade_signal",
  title: "Analyze trade signal",
  description:
    "Run the full analysis for a symbol and timeframe: LONG / SHORT / NO TRADE verdict with confluence score, confidence, directional edge, entry, stop loss, targets, risk-reward, and written reasoning.",
  inputSchema: {
    symbol: z.string().describe("Coin symbol in upper case, e.g. BTC."),
    timeframe: z.enum(["5m", "15m", "1h", "4h", "8h", "1d", "1w"]).describe("Analysis timeframe."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ symbol, timeframe }) => {
    const clean = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(clean)) throw new ToolError("Invalid symbol format.");
    const { generateSignal } = await import("../../signal.server");
    const r = await generateSignal({
      symbol: clean,
      timeframe: timeframe as Timeframe,
      provider: "lovable",
    });
    const payload = {
      symbol: r.symbol,
      timeframe: r.timeframe,
      generatedAt: r.generatedAt,
      currentPrice: r.currentPrice,
      marketRegime: r.marketRegime,
      sentiment: r.sentiment,
      direction: r.direction,
      confluenceScore: r.confluenceScore,
      confidence: r.confidence,
      directionalEdge: r.directionalEdge,
      entry: r.entry,
      stopLoss: r.stopLoss,
      target1: r.target1,
      target2: r.target2,
      target3: r.target3,
      riskReward: r.riskReward,
      summary: r.summary,
      reasoning: r.reasoning,
      rejectionReasons: r.rejectionReasons,
      invalidation: r.invalidation,
      indicators: r.indicators,
      dataSource: {
        candles: r.dataSource.candles,
        ticker: r.dataSource.ticker,
        exchange: r.dataSource.exchange,
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
