import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_live_price",
  title: "Get live price",
  description:
    "Get the live price and 24h stats (change %, high, low) for a crypto symbol, sourced from OKX, Binance or Kraken.",
  inputSchema: {
    symbol: z.string().describe("Coin symbol in upper case, e.g. BTC, ETH, SOL."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ symbol }) => {
    const clean = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(clean)) throw new ToolError("Invalid symbol format.");
    const { fetchTicker } = await import("../../market.server");
    const res = await fetchTicker(clean);
    const payload = {
      symbol: clean,
      price: res.value.price,
      change24hPct: res.value.change24hPct,
      high24h: res.value.high24h,
      low24h: res.value.low24h,
      source: res.source,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
