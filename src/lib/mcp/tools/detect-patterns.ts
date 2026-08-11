import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "detect_chart_patterns",
  title: "Detect chart patterns",
  description:
    "Detect classic chart patterns (double top/bottom, head and shoulders, triangles, wedges, flags) on live candles, with confidence, target and invalidation levels.",
  inputSchema: {
    symbol: z.string().describe("Coin symbol in upper case, e.g. BTC."),
    timeframe: z.enum(["4h", "8h", "1d", "1w"]).describe("Candle timeframe."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ symbol, timeframe }) => {
    const clean = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(clean)) throw new ToolError("Invalid symbol format.");
    const { generatePatternAnalysis } = await import("../../signal.server");
    const { patterns } = await generatePatternAnalysis(clean, timeframe);
    const payload = {
      symbol: clean,
      timeframe,
      count: patterns.length,
      patterns: patterns.map((p) => ({
        name: p.name,
        category: p.category,
        status: p.status,
        confidence: p.confidence,
        targetPrice: p.targetPrice,
        invalidPrice: p.invalidPrice,
        volumeStatus: p.volumeStatus,
        breakoutVolumeRatio: p.breakoutVolumeRatio,
        description: p.description,
      })),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});