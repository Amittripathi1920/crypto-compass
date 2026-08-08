import { computeIndicators, roundToTick } from "./indicators";
import { providerById, TIMEFRAMES } from "./coins";
import { fetchCandles, fetchTicker } from "./market.server";
import type { SignalRequest, SignalResult } from "./signal-types";
import { parseJsonLoose, runChat } from "./ai-providers.server";

const SYSTEM_PROMPT = `You are a disciplined crypto technical analyst. You are given pre-computed, factually accurate indicator values from real exchange candles. Never invent numbers: derive every level from the data given.

Decide LONG, SHORT, or NO TRADE for the requested timeframe, then produce trade levels:
- entry: a realistic price to open the trade (at market or a small pullback toward EMA20/structure).
- stopLoss: beyond invalidating structure, roughly 1x-2x ATR from entry. For LONG it must be BELOW entry, for SHORT ABOVE entry.
- target1 / target2: structure-based, in the trade direction, giving at least 1.5R on target1.
For NO TRADE, still give the levels you would use if the setup confirmed.

Respond with ONLY a JSON object with these keys:
{"direction":"LONG|SHORT|NO TRADE","confidence":0-100,"entry":number,"stopLoss":number,"target1":number,"target2":number,"summary":"one or two sentences","reasoning":[{"label":"Trend","detail":"..."},{"label":"Momentum","detail":"..."},{"label":"Volume","detail":"..."},{"label":"Structure","detail":"..."},{"label":"Volatility","detail":"..."}],"invalidation":"what would prove this setup wrong"}
Reference concrete numbers in each reasoning detail. Keep each detail under 300 characters.`;

export async function generateSignal(req: SignalRequest): Promise<SignalResult> {
  const [candles, ticker] = await Promise.all([
    fetchCandles(req.symbol, req.timeframe),
    fetchTicker(req.symbol),
  ]);

  const ind = computeIndicators(candles);
  const price = ticker.price || ind.price;
  const horizon = TIMEFRAMES.find((t) => t.value === req.timeframe)?.horizon ?? req.timeframe;
  const provider = providerById(req.provider);
  const model = req.model?.trim() || provider.defaultModel;

  const recent = candles.slice(-24).map((c) => ({
    o: roundToTick(c.open, price),
    h: roundToTick(c.high, price),
    l: roundToTick(c.low, price),
    c: roundToTick(c.close, price),
    v: Math.round(c.volume),
  }));

  const userPrompt = JSON.stringify(
    {
      asset: `${req.symbol}/USDT`,
      timeframe: req.timeframe,
      tradeHorizon: horizon,
      currentPrice: price,
      change24hPct: ticker.change24hPct,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
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

  let entry = num(parsed['entry'], price);
  // Keep the entry within a sane band of live price.
  if (Math.abs(entry - price) / price > 0.06) entry = price;

  const atrUnit = ind.atr > 0 ? ind.atr : price * 0.01;
  const dirSign = direction === "SHORT" ? -1 : 1;
  const fallbackStop = entry - dirSign * atrUnit * 1.5;
  const fallbackT1 = entry + dirSign * atrUnit * 2.5;
  const fallbackT2 = entry + dirSign * atrUnit * 4;

  let stopLoss = num(parsed['stopLoss'], fallbackStop);
  let target1 = num(parsed['target1'], fallbackT1);
  let target2 = num(parsed['target2'], fallbackT2);

  // Validate levels sit on the correct side of entry; otherwise use ATR anchors.
  const wrongSide =
    direction === "SHORT"
      ? stopLoss <= entry || target1 >= entry
      : stopLoss >= entry || target1 <= entry;
  if (wrongSide) {
    stopLoss = fallbackStop;
    target1 = fallbackT1;
    target2 = fallbackT2;
  }
  if (dirSign * (target2 - target1) <= 0) target2 = fallbackT2;

  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(target1 - entry);
  let riskReward = risk === 0 ? 0 : reward / risk;
  if (riskReward < 1) {
    target1 = entry + dirSign * risk * 2;
    target2 = entry + dirSign * risk * 3.2;
    riskReward = 2;
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

  return {
    symbol: req.symbol,
    timeframe: req.timeframe,
    generatedAt: new Date().toISOString(),
    modelUsed: `${provider.label} · ${model}`,
    currentPrice: price,
    change24hPct: ticker.change24hPct,
    high24h: ticker.high24h,
    low24h: ticker.low24h,
    direction,
    confidence,
    entry: roundToTick(entry, price),
    stopLoss: roundToTick(stopLoss, price),
    target1: roundToTick(target1, price),
    target2: roundToTick(target2, price),
    riskReward: Number(riskReward.toFixed(2)),
    summary: String(parsed['summary'] ?? "").slice(0, 600) || "Analysis generated from live market data.",
    reasoning,
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
