import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "list_supported_markets",
  title: "List supported markets",
  description:
    "List the crypto symbols and timeframes this analyzer supports. Call this first to pick valid arguments for the other tools.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const { COINS, TIMEFRAMES } = await import("../../coins");
    const payload = {
      coins: COINS.map((c) => ({ symbol: c.symbol, name: c.name })),
      timeframes: TIMEFRAMES.map((t) => ({ value: t.value, horizon: t.horizon })),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});