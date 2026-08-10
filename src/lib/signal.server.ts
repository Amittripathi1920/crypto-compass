import { computeIndicators, roundToTick, determineRegime, findSweetSpot } from "./indicators";
import { providerById, TIMEFRAMES } from "./coins";
import { fetchCandles, fetchTicker, fetchFearAndGreed, fetchGlobalCryptoMetrics } from "./market.server";
import type { SignalRequest, SignalResult } from "./signal-types";
import { parseJsonLoose, runChat } from "./ai-providers.server";

const SYSTEM_PROMPT = `You are a disciplined crypto technical analyst. You are given pre-computed technical values, higher timeframe context, classified market regime, retail sentiment (Fear & Greed index), BTC Dominance (BTC.D), and calculated candidate confluence "Sweet Spot" trade levels. Never invent numbers: derive every level from the data given.

CRITICAL CAPITAL PRESERVATION RULE:
- Only issue a trade setup (LONG or SHORT) if there is a HIGH-PROBABILITY confluence alignment (e.g. price is near a strong support cluster in an uptrend, or a resistance cluster in a downtrend).
- If the market is choppy, trend-less, or does not offer a clear, highly profitable edge, you MUST decide "direction": "NO TRADE". Prioritize capital preservation.
- If you decide NO TRADE, set "entry", "stopLoss", "target1", and "target2" to 0 in your JSON output.

Assess the trade alignment:
- Ensure entries align with the higher timeframe (HTF) trend if available.
- Analyze the BTC Dominance context:
  * If BTC.D is rising and BTC price is rising: prioritize Long BTC setups. Be highly critical of Altcoin longs (they will lag).
  * If BTC.D is falling and BTC price is stable/rising: Altcoin longs are highly profitable.
  * If BTC.D is rising and BTC price is falling: Alts bleed heavily; favor Short Altcoins.
- Review the pre-calculated confluence levels in "candidateConfluenceLevels" (Entry, Stop Loss, Target 1, Target 2). Use these levels as your primary structural baseline if you decide to trade. You may adjust them slightly but keep them structurally aligned.

Respond with ONLY a JSON object with these keys:
{"direction":"LONG|SHORT|NO TRADE","confidence":0-100,"entry":number,"stopLoss":number,"target1":number,"target2":number,"summary":"one or two sentences","reasoning":[{"label":"Trend","detail":"..."},{"label":"Momentum","detail":"..."},{"label":"Volume","detail":"..."},{"label":"Structure","detail":"..."},{"label":"Volatility","detail":"..."}],"invalidation":"what would prove this setup wrong"}
Reference concrete numbers in each reasoning detail. Keep each detail under 300 characters.`;


export async function generateSignal(req: SignalRequest): Promise<SignalResult> {
  const htfMap: Record<string, "4h" | "8h" | "1d" | "1w"> = {
    "4h": "1d",
    "8h": "1d",
    "1d": "1w",
    "1w": "1w",
  };
  const htfTimeframe = htfMap[req.timeframe] || "1d";

  const [candlesRes, tickerRes, htfCandlesRes, sentiment, globalMetrics] = await Promise.all([
    fetchCandles(req.symbol, req.timeframe),
    fetchTicker(req.symbol),
    req.timeframe !== "1w" ? fetchCandles(req.symbol, htfTimeframe) : Promise.resolve(null),
    fetchFearAndGreed(),
    fetchGlobalCryptoMetrics(),
  ]);
  const candles = candlesRes.value;
  const ticker = tickerRes.value;

  const ind = computeIndicators(candles);
  const price = ticker.price || ind.price;
  const horizon = TIMEFRAMES.find((t) => t.value === req.timeframe)?.horizon ?? req.timeframe;
  const provider = providerById(req.provider);
  const model = req.model?.trim() || provider.defaultModel;

  const regime = determineRegime(ind);

  let htfInd = null;
  if (htfCandlesRes) {
    try {
      htfInd = computeIndicators(htfCandlesRes.value);
    } catch (e) {
      console.warn("[signal] Failed to compute HTF indicators:", e);
    }
  }

  const atrVal = ind.atr > 0 ? ind.atr : price * 0.01;

  // Run the Confluence Sweet Spot Engine for Long & Short candidates
  const longSetup = findSweetSpot(ind, price, atrVal, true);
  const shortSetup = findSweetSpot(ind, price, atrVal, false);

  const recent = candles.slice(-24).map((c) => ({
    o: roundToTick(c.open, price),
    h: roundToTick(c.high, price),
    l: roundToTick(c.low, price),
    c: roundToTick(c.close, price),
    v: Math.round(c.volume),
  }));

  const btcDomText = globalMetrics ? `${globalMetrics.btcDominance}%` : "N/A";

  const userPrompt = JSON.stringify(
    {
      asset: `${req.symbol}/USDT`,
      timeframe: req.timeframe,
      tradeHorizon: horizon,
      currentPrice: price,
      change24hPct: ticker.change24hPct,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
      marketRegime: regime,
      fearAndGreedIndex: sentiment ? `${sentiment.value} (${sentiment.sentiment})` : "N/A",
      btcDominance: btcDomText,
      higherTimeframeContext: htfInd
        ? {
            timeframe: htfTimeframe,
            trend: htfInd.trend,
            bias: htfInd.bias,
            rsi14: Number(htfInd.rsi.toFixed(2)),
          }
        : "N/A",
      candidateConfluenceLevels: {
        longSetup: {
          entry: roundToTick(longSetup.entry, price),
          stopLoss: roundToTick(longSetup.stopLoss, price),
          target1: roundToTick(longSetup.target1, price),
          target2: roundToTick(longSetup.target2, price),
          reason: longSetup.confluenceReason,
        },
        shortSetup: {
          entry: roundToTick(shortSetup.entry, price),
          stopLoss: roundToTick(shortSetup.stopLoss, price),
          target1: roundToTick(shortSetup.target1, price),
          target2: roundToTick(shortSetup.target2, price),
          reason: shortSetup.confluenceReason,
        }
      },
      indicators: {
        rsi14: Number(ind.rsi.toFixed(2)),
        macd: Number(ind.macd.macd.toFixed(6)),
        macdSignal: Number(ind.macd.signal.toFixed(6)),
        macdHistogram: Number(ind.macd.histogram.toFixed(6)),
        ema20: roundToTick(ind.ema20, price),
        ema50: roundToTick(ind.ema50, price),
        ema200: roundToTick(ind.ema200, price),
        atr14: roundToTick(ind.atr, price),
        atrPctOfPrice: Number(ind.atrPct.toFixed(2)),
        swingHigh40: roundToTick(ind.swingHigh, price),
        swingLow40: roundToTick(ind.swingLow, price),
        trendReading: ind.trend,
        volumeTrend: ind.volume.label,
        volumeRatio: Number(ind.volume.ratio.toFixed(2)),
      },
      recentCandles: recent,
    },
    null,
    1,
  );

  const raw = await runChat({
    provider: req.provider,
    model,
    apiKey: req.apiKey,
    system: SYSTEM_PROMPT,
    user: userPrompt,
  });

  const parsed = parseJsonLoose(raw);
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  let direction: SignalResult["direction"] =
    parsed['direction'] === "LONG" || parsed['direction'] === "SHORT"
      ? parsed['direction']
      : "NO TRADE";

  // Grab the correct setup candidate
  const setup = direction === "SHORT" ? shortSetup : longSetup;

  let entry = direction === "NO TRADE" ? 0 : num(parsed['entry'], setup.entry);
  let stopLoss = direction === "NO TRADE" ? 0 : num(parsed['stopLoss'], setup.stopLoss);
  let target1 = direction === "NO TRADE" ? 0 : num(parsed['target1'], setup.target1);
  let target2 = direction === "NO TRADE" ? 0 : num(parsed['target2'], setup.target2);
  let riskReward = 0;

  if (direction !== "NO TRADE") {
    if (Math.abs(entry - price) / price > 0.06) entry = setup.entry;

    const dirSign = direction === "SHORT" ? -1 : 1;
    const fallbackStop = setup.stopLoss;
    const fallbackT1 = setup.target1;
    const fallbackT2 = setup.target2;

    // Validate levels sit on the correct side of entry; otherwise use structural fallbacks.
    const wrongSide =
      direction === "SHORT"
        ? stopLoss <= entry || target1 >= entry
        : stopLoss >= entry || target1 <= entry;
    if (wrongSide) {
      stopLoss = fallbackStop;
      target1 = fallbackT1;
      target2 = fallbackT2;
    }

    // Ensure Target 2 is further than Target 1 in the direction of the trade
    const isT2Valid = direction === "SHORT" ? target2 < target1 : target2 > target1;
    if (!isT2Valid) {
      target2 = fallbackT2;
    }

    // Ensure risk-to-reward ratio for Target 1 is at least 1.0 (to avoid bad trades)
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(target1 - entry);
    riskReward = risk === 0 ? 0 : reward / risk;
    if (riskReward < 1) {
      target1 = entry + dirSign * risk * 1.5;
      target2 = entry + dirSign * risk * 2.8;
      riskReward = 1.5;
    }
  }

  let confidence = Math.round(num(parsed['confidence'], 55));
  confidence = Math.min(95, Math.max(5, confidence));
  if (direction === "NO TRADE") confidence = Math.min(confidence, 50);

  const reasoningRaw = Array.isArray(parsed['reasoning']) ? parsed['reasoning'] : [];
  const reasoning = reasoningRaw
    .map((r) => {
      const item = r as { label?: unknown; detail?: unknown };
      return {
        label: String(item.label ?? "Note"),
        detail: String(item.detail ?? "").slice(0, 400),
      };
    })
    .filter((r) => r.detail.length > 0)
    .slice(0, 6);

  // Inject dynamic reasoning elements for BTC Dominance and Confluence setup
  if (globalMetrics) {
    reasoning.push({
      label: "BTC Dominance",
      detail: `BTC.D is at ${globalMetrics.btcDominance}%. ${
        req.symbol === "BTC"
          ? "BTC is leading the capital flow index."
          : "Altcoins are heavily dependent on BTC.D trends for breakout extensions."
      }`,
    });
  }

  if (setup.confluenceReason && setup.confluenceReason.includes("Sweet Spot")) {
    reasoning.push({
      label: "Confluence",
      detail: `${setup.confluenceReason} detected. Strong structural cluster protects the setup.`,
    });
  }

  return {
    symbol: req.symbol,
    timeframe: req.timeframe,
    generatedAt: new Date().toISOString(),
    modelUsed: `${provider.label} · ${model}`,
    dataSource: {
      candles: candlesRes.source,
      ticker: tickerRes.source,
      attempts: [
        ...candlesRes.attempts,
        ...tickerRes.attempts,
        ...(htfCandlesRes ? htfCandlesRes.attempts : []),
      ],
    },
    currentPrice: price,
    change24hPct: ticker.change24hPct,
    high24h: ticker.high24h,
    low24h: ticker.low24h,
    marketRegime: regime,
    sentiment: sentiment ? { value: sentiment.value, label: sentiment.sentiment } : null,
    direction,
    confidence,
    entry: roundToTick(entry, price),
    stopLoss: roundToTick(stopLoss, price),
    target1: roundToTick(target1, price),
    target2: roundToTick(target2, price),
    riskReward: Number(riskReward.toFixed(2)),
    summary: String(parsed['summary'] ?? "").slice(0, 600) || "Analysis generated from live market data.",
    reasoning: reasoning.slice(0, 6),
    invalidation: String(parsed['invalidation'] ?? "").slice(0, 400),
    indicators: {
      rsi: Number(ind.rsi.toFixed(1)),
      macd: ind.macd.macd,
      macdSignal: ind.macd.signal,
      macdHistogram: ind.macd.histogram,
      ema20: roundToTick(ind.ema20, price),
      ema50: roundToTick(ind.ema50, price),
      ema200: roundToTick(ind.ema200, price),
      atr: roundToTick(ind.atr, price),
      atrPct: Number(ind.atrPct.toFixed(2)),
      swingHigh: roundToTick(ind.swingHigh, price),
      swingLow: roundToTick(ind.swingLow, price),
      trend: ind.trend,
      volumeLabel: ind.volume.label,
      volumeRatio: Number(ind.volume.ratio.toFixed(2)),
    },
    candles: candles.slice(-80),
  };
}

export async function generatePatternAnalysis(symbol: string, timeframe: string) {
  const { fetchCandles } = await import("./market.server");
  const { detectPatterns } = await import("./patterns");
  const res = await fetchCandles(symbol, timeframe as any);
  const candles = res.value;
  const patterns = detectPatterns(candles);
  return { candles, patterns };
}
