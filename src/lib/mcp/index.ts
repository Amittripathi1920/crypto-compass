import { defineMcp } from "@lovable.dev/mcp-js";
import type { ToolDefinition } from "@lovable.dev/mcp-js";
import listMarketsTool from "./tools/list-coins";
import getLivePriceTool from "./tools/get-price";
import getIndicatorsTool from "./tools/get-indicators";
import detectPatternsTool from "./tools/detect-patterns";
import analyzeSignalTool from "./tools/analyze-signal";
import getSentimentTool from "./tools/get-sentiment";

export default defineMcp({
  name: "crypto-compass",
  title: "Crypto Compass",
  version: "0.1.0",
  instructions:
    "Crypto technical analysis tools over live public market data. Call `list_supported_markets` first for valid symbols and timeframes. Use `get_live_price` for spot prices, `get_technical_indicators` for RSI/MACD/EMA/ATR readings, `detect_chart_patterns` for classic pattern detection, `get_market_sentiment` for Fear & Greed and BTC dominance, and `analyze_trade_signal` for a full LONG/SHORT/NO TRADE verdict with entry, stop loss and targets. Output is technical analysis, not financial advice.",
  tools: [
    listMarketsTool,
    getLivePriceTool,
    getIndicatorsTool,
    detectPatternsTool,
    getSentimentTool,
    analyzeSignalTool,
  ] as unknown as ToolDefinition<Record<string, never>, undefined>[],
});