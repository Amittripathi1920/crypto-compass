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
import { AiExplanationSchema, validateAiExplanation } from "../../ai-providers.server";
import type { DirectionalScoreResult, SwingPoint } from "../types";
import type { Candle } from "../../indicators";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

export async function runSmokeTests() {
  console.log("\n🚀 Running Crypto Compass Engine Refactor Smoke Tests...\n");

  // 1. Test Config & Weights Validation
  console.log("--- 1. Testing Config & Weights ---");
  const validConfig = validateEngineConfig({
    minimumConfluenceScore: 65,
    minimumDirectionalEdge: 15,
  });
  assert(validConfig.minimumConfluenceScore === 65, "Custom minimumConfluenceScore parsed");
  assert(validConfig.minimumDirectionalEdge === 15, "Custom minimumDirectionalEdge parsed");
  const weightSum = Object.values(validConfig.weights).reduce((a, b) => a + b, 0);
  assert(weightSum === 100, `Weights sum to exactly 100 (got ${weightSum})`);

  // 2. Test Direction Resolver: Independent Long vs Short Scores & Directional Edge Threshold
  console.log("\n--- 2. Testing Direction Resolver ---");
  const mockLongStrong: DirectionalScoreResult = {
    direction: "LONG",
    score: 78,
    evidence: [
      { label: "HTF", detail: "Bullish", score: 20, max: 20, aligned: true, direction: "LONG" },
    ],
  };
  const mockShortWeak: DirectionalScoreResult = {
    direction: "SHORT",
    score: 51,
    evidence: [
      { label: "HTF", detail: "Neutral", score: 5, max: 20, aligned: false, direction: "SHORT" },
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

  // Test Close Scores -> NO TRADE
  const mockLongClose: DirectionalScoreResult = {
    direction: "LONG",
    score: 63,
    evidence: [],
  };
  const mockShortClose: DirectionalScoreResult = {
    direction: "SHORT",
    score: 61,
    evidence: [],
  };

  const resolution2 = ConfluenceEngine.resolveSetup(
    mockLongClose,
    mockShortClose,
    true,
    undefined,
    true,
    2.0,
    true,
    "RANGING",
    false,
    validConfig,
  );
  assert(
    resolution2.decision === "NO TRADE",
    `Long 63 vs Short 61 resolves to NO TRADE due to edge threshold (got ${resolution2.decision})`,
  );
  assert(
    resolution2.rejectionReasons.some((r) => r.includes("Directional edge")),
    "Rejection reasons include directional edge filter",
  );

  // 3. Test Structural Stop Loss Engine
  console.log("\n--- 3. Testing Stop Loss Engine ---");
  const mockSwings: SwingPoint[] = [
    { index: 5, price: 92000, type: "low", time: 1000, strength: 4, isExternal: true },
    { index: 10, price: 96000, type: "high", time: 2000, strength: 4, isExternal: true },
    { index: 15, price: 93500, type: "low", time: 3000, strength: 4, isExternal: true },
  ];

  const entryPrice = 95000;
  const atrVal = 500;
  const slResultLong = StopLossEngine.calculateStop(
    entryPrice,
    "LONG",
    mockSwings,
    null,
    null,
    atrVal,
    0.3,
  );
  assert(slResultLong.isValid, "Long stop loss is structurally valid");
  assert(
    slResultLong.stopLoss < 93500,
    `Long stop loss placed below swing low ($93,500) with ATR buffer (got $${slResultLong.stopLoss})`,
  );
  assert(slResultLong.stopLoss > 90000, "Long stop loss is within safe ATR boundaries");

  // 4. Test Take Profit Targets
  console.log("\n--- 4. Testing Take Profit Targets ---");
  const tpTargets = TakeProfitEngine.calculateTargets(
    entryPrice,
    slResultLong.stopLoss,
    "LONG",
    [
      { id: "1", type: "PDH", price: 97000, strength: 20, isSwept: false, time: 100 },
      { id: "2", type: "PWH", price: 100000, strength: 25, isSwept: false, time: 200 },
    ],
    [],
    atrVal,
  );
  assert(
    tpTargets.tp1 >= 97000,
    `TP1 mapped to nearest opposing liquidity at $97,000 (got $${tpTargets.tp1})`,
  );
  assert(tpTargets.tp2 >= 98000, `TP2 mapped with proper risk progression (got $${tpTargets.tp2})`);
  assert(tpTargets.tp3 >= 100000, `TP3 mapped to HTF liquidity (got $${tpTargets.tp3})`);

  // 5. Test Market Regime Gate
  console.log("\n--- 5. Testing Market Regime Gate ---");
  const bearGateForLong = MarketRegimeEngine.evaluateGate("STRONG_BEARISH", "LONG", false);
  assert(
    !bearGateForLong.allowed,
    "STRONG_BEARISH regime gates against counter-trend Long without internal reversal",
  );

  const bearGateForLongWithReversal = MarketRegimeEngine.evaluateGate(
    "STRONG_BEARISH",
    "LONG",
    true,
  );
  assert(
    bearGateForLongWithReversal.allowed,
    "Internal reversal (CHoCH) permits counter-trend attempt",
  );

  // 6. Test Zod AI Validation Schema
  console.log("\n--- 6. Testing AI Zod Schema ---");
  const validAiJson = {
    summary:
      "Strong bullish liquidity sweep of PDL with 4H trend alignment confirms long continuation.",
    invalidation: "15M candle close below swing low at $93,350.",
  };
  const validatedAi = validateAiExplanation(validAiJson);
  assert(
    validatedAi !== null && validatedAi.summary.length > 10,
    "Valid AI explanation parsed correctly by Zod",
  );

  const invalidAiJson = {
    summary: "short",
    // Missing invalidation
  };
  const invalidAiResult = validateAiExplanation(invalidAiJson);
  assert(invalidAiResult === null, "Malformed AI response rejected by Zod schema");

  console.log("\n🎉 All Smoke Tests Passed Successfully!\n");
}

runSmokeTests();
