import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "get_market_sentiment",
  title: "Get market sentiment",
  description:
    "Get the crypto Fear & Greed index plus global market metrics such as BTC dominance and total market cap.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async () => {
    const { fetchFearAndGreed, fetchGlobalCryptoMetrics } = await import("../../market.server");
    const [sentiment, global] = await Promise.all([
      fetchFearAndGreed(),
      fetchGlobalCryptoMetrics(),
    ]);
    const payload = { fearAndGreed: sentiment, globalMetrics: global };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});