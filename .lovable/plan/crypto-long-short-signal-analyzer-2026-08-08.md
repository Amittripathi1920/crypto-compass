# Crypto Long/Short Signal Analyzer

A single-page tool where you pick a coin and a timeframe, hit Analyze, and get a Long or Short call with the reasoning behind it plus concrete trade levels.

## What you get

**Coin + timeframe picker**

- Top ~20 coins by market cap (BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK, TON, TRX, DOT, MATIC, LTC, BCH, NEAR, UNI, APT, ICP, ATOM).
- Timeframe selector: 15m, 1h, 4h, 1d.

**Signal card**

- LONG / SHORT / NO TRADE verdict with a confidence level.
- Current price (live).
- Entry price, stop loss, and up to two target prices.
- Risk:reward ratio calculated from those levels.

**Why this signal**

- Plain-English reasoning: trend, momentum, volume, key support/resistance, and volatility.
- The raw indicator readings shown alongside so you can sanity-check the call: RSI, MACD, EMA 20/50/200, ATR, recent swing high/low, volume trend.
- Invalidation note: what would make this setup wrong.

**Price chart**

- Candlestick-style chart of recent candles with entry / stop / target lines drawn on it.

**Disclaimer**

- Clear "not financial advice" note; nothing is stored, every analysis is on-demand.

## How the analysis works

1. Live market data (candles + current price) is pulled from a free public crypto market data API — no account or key needed.
2. Indicators (RSI, MACD, EMA 20/50/200, ATR, swing levels, volume trend) are computed in code from the real candles, so numbers are deterministic and never hallucinated.
3. Those computed values plus recent price action go to Lovable AI, which returns a structured verdict: direction, confidence, entry, stop loss, targets, and the reasoning bullets. Build in a way so that in future I can use Claude, groq, or gemini or open ai in future, or select ai from frontend and provide  api key from the tool and it uses that
4. Stop loss and targets are ATR- and swing-anchored, and validated in code (stop on the correct side of entry, R:R sanity-checked) before display.

## Technical notes

- Market data fetch + indicator math + AI call all run server-side in a `createServerFn` (`src/lib/signal.functions.ts`), so no keys or logic ship to the browser.
- Indicator math lives in a pure helper module with no external TA dependency.
- AI call uses the Lovable AI Gateway with structured output; schema kept lean, numeric levels re-validated in code after parsing. Gateway errors (rate limit / credits) surface as clear in-app messages.
- No database — nothing persisted. React Query handles fetch state; results refresh on demand.
- Page replaces the placeholder at `/` with its own SEO head metadata.