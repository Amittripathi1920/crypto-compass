import { ConfluenceEngine } from "../ConfluenceEngine";
import { DEFAULT_CONFIG, validateEngineConfig, WEIGHTS } from "../config";
import {
  EntryEngine,
  StopLossEngine,
  TakeProfitEngine,
  RiskEngine,
} from "../TradeExecutionEngines";
import { MarketRegimeEngine } from "../MarketRegimeEngine";
import { MarketStructureEngine } from "../MarketStructureEngine";
import { LiquidityEngine } from "../LiquidityEngine";
import { ZoneEngine } from "../ZoneEngine";
import { BacktestEngine } from "../BacktestEngine";
import { normalizeCandles } from "../../market.server";
import { AiExplanationSchema, validateAiExplanation } from "../../ai-providers.server";
import type { DirectionalScoreResult, SwingPoint, Candle } from "../types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

export async function runSmokeTests() {
  console.log("\n🚀 Running Crypto Compass Engineering Master Smoke Tests...\n");

  // 1. Test Config & Weights Validation
  console.log("--- 1. Testing Config & Weights ---");
  const validConfig = validateEngineConfig({
    minimumConfluenceScore: 65,
    minimumDirectionalEdge: 15,
    requireStructuralTargets: true,
  });
  assert(validConfig.minimumConfluenceScore === 65, "Custom minimumConfluenceScore parsed");
  assert(validConfig.minimumDirectionalEdge === 15, "Custom minimumDirectionalEdge parsed");
  assert(validConfig.requireStructuralTargets === true, "requireStructuralTargets enabled");
  const weightSum = Object.values(validConfig.weights).reduce((a, b) => a + b, 0);
  assert(weightSum === 100, `Weights sum to exactly 100 (got ${weightSum})`);

  // 2. Test Direction Resolver: Independent Long vs Short Scores, Directional vs Tradeability, and Structured Hierarchy
  console.log("\n--- 2. Testing Direction Resolver & Rejection Hierarchy ---");
  const mockLongStrong: DirectionalScoreResult = {
    direction: "LONG",
    score: 78,
    directionalScore: 50,
    tradeabilityScore: 28,
    evidence: [
      { label: "HTF", detail: "Bullish", score: 20, max: 20, aligned: true, direction: "LONG", category: "DIRECTION" },
    ],
  };
  const mockShortWeak: DirectionalScoreResult = {
    direction: "SHORT",
    score: 51,
    directionalScore: 25,
    tradeabilityScore: 26,
    evidence: [
      { label: "HTF", detail: "Neutral", score: 5, max: 20, aligned: false, direction: "SHORT", category: "DIRECTION" },
    ],
  };

  const resolution1 = ConfluenceEngine.resolveSetup(
    mockLongStrong,
    mockShortWeak,
    true,
    undefined,
    true,
    2.5,
    true,
    true,
    "BULLISH",
    false,
    validConfig,
  );
  assert(
    resolution1.decision === "LONG",
    `Long 78 vs Short 51 resolves to LONG (got ${resolution1.decision})`,
  );
  assert(
    resolution1.directionalEdge === 27,
    `Directional edge is 27 pts (got ${resolution1.directionalEdge})`,
  );
  assert(
    resolution1.confidence === "High",
    `Confidence is High for 78 score & 27 edge (got ${resolution1.confidence})`,
  );
  assert(resolution1.rejectionHierarchy.blockers.length === 0, "No hard blockers for strong setup");

  // Test Non-Structural Manufactured Target Rejection
  const resolutionNonStructural = ConfluenceEngine.resolveSetup(
    mockLongStrong,
    mockShortWeak,
    true,
    undefined,
    true,
    2.5,
    false, // isStructuralTarget = false
    true,
    "BULLISH",
    false,
    validConfig,
  );
  assert(
    resolutionNonStructural.decision === "NO TRADE",
    "Setup rejected as NO TRADE when genuine opposing structural liquidity does not exist",
  );
  assert(
    resolutionNonStructural.rejectionHierarchy.blockers.some((b) => b.includes("opposing structural liquidity")),
    "Blocker explicitly warns of missing structural liquidity target",
  );

  // 3. Test Entry Models (Market, Limit, Breakout)
  console.log("\n--- 3. Testing Entry Models ---");
  const atrVal = 500;
  const currentPrice = 95000;

  // Test Limit Entry on Order Block
  const mockOB = {
    id: "ob1",
    type: "DEMAND" as const,
    topPrice: 94500,
    bottomPrice: 94000,
    time: 1000,
    isFresh: true,
    testCount: 0,
    volumeConfirm: 1.5,
  };
  const limitEntry = EntryEngine.calculateEntry(currentPrice, "LONG", null, mockOB, null, null, atrVal, true);
  assert(limitEntry.entryType === "LIMIT", `Entry on distant OB is LIMIT order (got ${limitEntry.entryType})`);
  assert(limitEntry.entryPrice === 94500, `Limit entry price placed at OB top ($94,500)`);
  assert(limitEntry.entryZone.min === 94000 && limitEntry.entryZone.max === 94500, "Entry zone matches OB boundaries");

  // Test Market Entry on active Sweep
  const mockSweep = {
    direction: "BULLISH" as const,
    sweptLevelPrice: 94200,
    sweptLevelType: "PDL" as const,
    wickSize: 300,
    closeLocation: 94600,
    time: 2000,
    recencyCandles: 1,
    reactionStrength: 1.1,
  };
  const marketEntry = EntryEngine.calculateEntry(currentPrice, "LONG", mockSweep, null, null, null, atrVal, true);
  assert(marketEntry.entryType === "MARKET", `Entry on active sweep rejection is MARKET order (got ${marketEntry.entryType})`);

  // 4. Test Protected Swing Stop Loss Selection
  console.log("\n--- 4. Testing Protected Stop Loss Selection ---");
  const mockSwingsWithProtected: SwingPoint[] = [
    { index: 5, price: 92000, type: "low", time: 1000, strength: 4, classification: "MAJOR" },
    { index: 10, price: 93500, type: "low", time: 2000, strength: 4, classification: "PROTECTED", causesBos: true },
    { index: 15, price: 94800, type: "low", time: 3000, strength: 2, classification: "INTERNAL" }, // minor noise low
  ];

  const slResultLong = StopLossEngine.calculateStop(
    currentPrice,
    "LONG",
    mockSwingsWithProtected,
    null,
    null,
    atrVal,
    0.3,
  );
  assert(slResultLong.isValid, "Long stop loss is structurally valid");
  assert(
    slResultLong.anchorType === "PROTECTED_SWING",
    `Stop loss correctly anchored to PROTECTED swing (got ${slResultLong.anchorType})`,
  );
  assert(
    slResultLong.stopLoss < 93500 && slResultLong.stopLoss > 93000,
    `Stop loss placed safely below protected low ($93,500) rather than minor internal low ($94,800) (got $${slResultLong.stopLoss})`,
  );

  // 5. Test Closed-Candle Normalization
  console.log("\n--- 5. Testing Closed-Candle Normalization ---");
  const now = Date.now();
  const mockRawCandles: Candle[] = [
    { time: now - 30 * 60 * 1000, open: 95000, high: 95500, low: 94900, close: 95300, volume: 100 },
    { time: now - 15 * 60 * 1000, open: 95300, high: 95800, low: 95200, close: 95600, volume: 120 },
    { time: now - 2 * 60 * 1000, open: 95600, high: 96000, low: 95500, close: 95900, volume: 50 }, // forming 15m candle
  ];
  const closedCandles = normalizeCandles(mockRawCandles, "15m", true);
  assert(closedCandles.length === 2, `Closed-only filter dropped the unclosed forming candle (kept ${closedCandles.length}/3)`);

  // 6. Test Risk Engine Net R & Fees
  console.log("\n--- 6. Testing Risk Engine Fees & Net R:R ---");
  const tpTargets = { tp1: 97000, tp2: 99000, tp3: 102000 };
  const riskAnalysis = RiskEngine.analyze(currentPrice, 93500, tpTargets, "LONG", 1000, 1.0, 2, 5, 4);
  assert(riskAnalysis !== null, "Risk analysis computed successfully");
  assert(riskAnalysis!.netRiskReward.tp2 < riskAnalysis!.riskReward.tp2, "Net R:R properly deducts maker/taker fees and slippage");
  assert(riskAnalysis!.estimatedFees > 0, `Estimated fees calculated ($${riskAnalysis!.estimatedFees})`);

  // 7. Test Zod AI Validation Schema
  console.log("\n--- 7. Testing AI Zod Schema ---");
  const validAiJson = {
    summary: "Strong bullish liquidity sweep of PDL with 4H trend alignment confirms long continuation.",
    invalidation: "15M candle close below swing low at $93,350.",
  };
  const validatedAi = validateAiExplanation(validAiJson);
  assert(
    validatedAi !== null && validatedAi.summary.length > 10,
    "Valid AI explanation parsed correctly by Zod",
  );

  console.log("\n🎉 All Master Smoke Tests Passed Successfully!\n");
}

runSmokeTests();
