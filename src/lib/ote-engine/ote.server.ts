import { fetchConsistentMarketData } from "../market.server";
import { providerById } from "../coins";
import { runChat, parseJsonLoose, validateAiExplanation } from "../ai-providers.server";
import { OteEngine } from "./OteEngine";
import type { OteSignal, OteSignalRequest } from "./types";

const OTE_SYSTEM_PROMPT = `You are a quantitative institutional trader and Smart Money Concepts (SMC) specialist.
You are given an institutional Optimal Trade Entry (OTE) setup calculated deterministically.
Your ONLY job is to write:
1. A concise, high-conviction "summary" highlighting the 4 pillars (Liquidity Sweep, Displacement/MSS, OTE Discount/Premium Fib level, and Target Liquidity).
2. A clear "invalidation" sentence defining the structural failure condition.
Do NOT invent or alter prices/levels: keep output strictly aligned with the provided engine data.
Respond with ONLY a JSON object:
{"summary":"polished SMC institutional analysis","invalidation":"what would prove this setup wrong"}`;

export async function generateOteSignal(req: OteSignalRequest): Promise<OteSignal> {
  const symbol = req.symbol.toUpperCase().trim();
  const tf = req.timeframe;

  // Determine timeframes needed for OTE analysis
  const requestedTfs =
    tf === "1d" || tf === "1w"
      ? ["1w", "1d", "4h"]
      : tf === "4h" || tf === "8h"
        ? ["1d", "4h", "1h", "15m"]
        : ["1d", "4h", "15m", "5m"];

  // 1. Fetch multi-timeframe candles consistently
  const marketData = await fetchConsistentMarketData(symbol, requestedTfs as any);

  const c1w = marketData.candles["1w"] || marketData.candles["1d"] || [];
  const c1d = marketData.candles["1d"] || [];
  const c4h = marketData.candles["4h"] || [];
  const c1h = marketData.candles["1h"] || [];
  const c15m = marketData.candles["15m"] || [];
  const c5m = marketData.candles["5m"] || c15m;

  let macroCandles = c1d;
  let setupCandles = c15m;
  let triggerCandles = c5m;

  if (tf === "1d" || tf === "1w") {
    macroCandles = c1w;
    setupCandles = c1d;
    triggerCandles = c4h;
  } else if (tf === "4h" || tf === "8h") {
    macroCandles = c1d;
    setupCandles = c4h;
    triggerCandles = c15m;
  } else if (tf === "1h") {
    macroCandles = c1d;
    setupCandles = c1h;
    triggerCandles = c15m;
  }

  const ticker = marketData.ticker;
  const currentPrice =
    ticker.price ||
    triggerCandles[triggerCandles.length - 1]?.close ||
    setupCandles[setupCandles.length - 1]?.close ||
    0;

  // 2. Run deterministic OteEngine
  const signal = OteEngine.analyze(
    symbol,
    tf,
    macroCandles,
    setupCandles,
    triggerCandles,
    currentPrice,
    req.minRR ?? 1.8,
    req.minGrade ?? "B",
    {
      exchange: marketData.source,
      attempts: marketData.attempts,
    },
  );

  // 3. AI Explanation comes strictly LAST
  const provider = providerById(req.provider);
  const model = req.model?.trim() || provider.defaultModel;

  const userPrompt = JSON.stringify({
    symbol,
    direction: signal.direction,
    setupGrade: signal.setupGrade,
    qualityScore: signal.qualityScore,
    htfBias: signal.htfBias,
    sweep: signal.sweep ? `${signal.sweep.levelType} at $${signal.sweep.price}` : "None",
    displacement: signal.displacement
      ? `${signal.displacement.displacementAtrRatio}x ATR with RVOL ${signal.displacement.rvol}x`
      : "None",
    entryModel: signal.entry.type,
    entryPrice: signal.entry.entryPrice,
    stopLoss: signal.stopLoss.stopLossPrice,
    tp1: signal.targets.tp1.price,
    tp2: signal.targets.tp2.price,
    tp3: signal.targets.tp3.price,
    grossRR: signal.targets.grossRR,
    reasons: signal.reasons,
    blockers: signal.blockers,
  });

  let aiSummary = signal.summary;
  let aiInvalidation = signal.invalidation;

  try {
    const raw = await runChat({
      provider: req.provider,
      model,
      apiKey: req.apiKey,
      system: OTE_SYSTEM_PROMPT,
      user: userPrompt,
    });
    const parsed = parseJsonLoose(raw);
    const validated = validateAiExplanation(parsed);
    if (validated) {
      aiSummary = validated.summary;
      aiInvalidation = validated.invalidation;
    }
  } catch (e) {
    console.warn("[ote-signal] AI explanation fallback to deterministic summary:", e);
  }

  signal.summary = aiSummary;
  signal.invalidation = aiInvalidation;

  return signal;
}
