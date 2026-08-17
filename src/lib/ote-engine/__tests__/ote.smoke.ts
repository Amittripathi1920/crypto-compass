import { OteEngine } from "../OteEngine";
import type { Candle } from "../../indicators";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ OTE Assertion Failed: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ ${msg}`);
}

export function runOteSmokeTests() {
  console.log("\n🎯 Running Institutional OTE Engine Smoke Tests...\n");

  const now = Date.now();
  const m15 = 15 * 60 * 1000;

  // Build synthetic candles
  // Macro 1D candles:
  const macroCandles: Candle[] = [
    { time: now - 3 * 86400000, open: 90000, high: 95000, low: 89000, close: 94000, volume: 1000 },
    { time: now - 2 * 86400000, open: 94000, high: 96000, low: 93000, close: 95500, volume: 1200 }, // PDH: 96000, PDL: 93000
    { time: now - 1 * 86400000, open: 95500, high: 97000, low: 94500, close: 96500, volume: 1100 },
  ];

  // Setup candles:
  const setupCandles: Candle[] = [];
  for (let i = 40; i >= 0; i--) {
    const t = now - i * m15;
    const base = 94000 + Math.sin(i / 5) * 500;
    setupCandles.push({
      time: t,
      open: base,
      high: base + 200,
      low: base - 200,
      close: base + 50,
      volume: 100,
    });
  }

  // Trigger candles: Simulate a Bullish PDL Sweep -> Strong Displacement MSS -> Retest into OTE 61.8%
  const triggerCandles: Candle[] = [];
  const t0 = now - 10 * 5 * 60 * 1000;

  // 1. Initial drop toward PDL ($93,000)
  triggerCandles.push({ time: t0, open: 93800, high: 93900, low: 93400, close: 93500, volume: 150 });
  triggerCandles.push({ time: t0 + 5 * 60000, open: 93500, high: 93600, low: 93100, close: 93200, volume: 180 });

  // 2. The Sweep: Pierces PDL ($93,000) down to $92,600, but closes back above at $93,300 with large wick & RVOL
  triggerCandles.push({ time: t0 + 10 * 60000, open: 93200, high: 93400, low: 92600, close: 93300, volume: 500 });

  // 3. Displacement Leg (MSS): Aggressive green expansion up to $95,000 leaving FVG
  triggerCandles.push({ time: t0 + 15 * 60000, open: 93300, high: 94100, low: 93250, close: 94000, volume: 400 });
  triggerCandles.push({ time: t0 + 20 * 60000, open: 94000, high: 94800, low: 93900, close: 94700, volume: 450 });
  triggerCandles.push({ time: t0 + 25 * 60000, open: 94700, high: 95200, low: 94600, close: 95000, volume: 380 });

  // 4. Retest pullback into 61.8% OTE (between $93,500 and $93,800)
  const currentPrice = 93650;
  triggerCandles.push({ time: t0 + 30 * 60000, open: 95000, high: 95050, low: 94200, close: 94300, volume: 120 });
  triggerCandles.push({ time: t0 + 35 * 60000, open: 94300, high: 94400, low: 93600, close: currentPrice, volume: 140 });

  const signal = OteEngine.analyze(
    "BTC",
    "15m",
    macroCandles,
    setupCandles,
    triggerCandles,
    currentPrice,
    1.8,
    "B",
  );

  console.log("OTE Analysis Output:", {
    direction: signal.direction,
    setupGrade: signal.setupGrade,
    qualityScore: signal.qualityScore,
    sweep: signal.sweep?.levelType,
    displacementAtr: signal.displacement?.displacementAtrRatio,
    inOteZone: signal.fibZone?.inOteZone,
    entryType: signal.entry.type,
    stopLoss: signal.stopLoss.stopLossPrice,
    tp1: signal.targets.tp1.price,
    tp2: signal.targets.tp2.price,
    netRR: signal.targets.netRR,
  });

  assert(signal.direction === "LONG", `Identified LONG direction after PDL sweep (got ${signal.direction})`);
  assert(signal.sweep !== null, "Detected active liquidity sweep event");
  assert(signal.displacement !== null, "Detected institutional displacement leg");
  assert(signal.fibZone !== null, "Computed 50%, 61.8%, 70.5%, and 78.6% Fib levels");
  assert(signal.fibZone!.inDiscountOrPremium, "Price is in Discount zone (< 50% equilibrium)");
  assert(signal.stopLoss.stopLossPrice < 92600, `Stop loss placed safely below sweep low $92,600 (got $${signal.stopLoss.stopLossPrice})`);
  assert(signal.targets.tp1.price > currentPrice, "TP1 placed above entry");
  assert(signal.targets.tp2.price > signal.targets.tp1.price, "TP2 provides higher structural objective");
  assert(signal.qualityScore >= 60, `Quality score exceeds 60 (got ${signal.qualityScore})`);

  console.log("\n🎉 All Institutional OTE Smoke Tests Passed Successfully!\n");
}

runOteSmokeTests();
