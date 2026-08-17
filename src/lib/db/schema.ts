import {
  pgSchema,
  pgTable,
  text,
  timestamp,
  boolean,
  doublePrecision,
  bigint,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

// Define the neon_auth schema managed by Neon Auth
export const authSchema = pgSchema("neon_auth");

// Neon Authorize tables inside neon_auth schema (aligned with exact database columns)
export const user = authSchema.table("user", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(), // camelCase column
  image: text("image"),
  createdAt: timestamp("createdAt").defaultNow().notNull(), // camelCase column
  updatedAt: timestamp("updatedAt").defaultNow().notNull(), // camelCase column
});

export const session = authSchema.table("session", {
  id: uuid("id").primaryKey().defaultRandom().notNull(), // UUID primary key
  expiresAt: timestamp("expiresAt").notNull(), // camelCase column
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(), // camelCase column
  updatedAt: timestamp("updatedAt").notNull(), // camelCase column
  ipAddress: text("ipAddress"), // camelCase column
  userAgent: text("userAgent"), // camelCase column
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }), // camelCase column
});

export const account = authSchema.table("account", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const verification = authSchema.table("verification", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// Custom application tables inside public schema
export const trackedTrades = pgTable("tracked_trades", {
  id: text("id").primaryKey().notNull(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  direction: text("direction").notNull(),
  entry: doublePrecision("entry").notNull(),
  stopLoss: doublePrecision("stop_loss").notNull(),
  target1: doublePrecision("target_1").notNull(),
  target2: doublePrecision("target_2").notNull(),
  leverage: doublePrecision("leverage").notNull(),
  balance: doublePrecision("balance").notNull(),
  entryTime: bigint("entry_time", { mode: "number" }).notNull(),
  fillTime: bigint("fill_time", { mode: "number" }),
  closeTime: bigint("close_time", { mode: "number" }),
  status: text("status").notNull(),
  currentPrice: doublePrecision("current_price"),
  history: jsonb("history").notNull(),
});

// Custom tables for Confluence engine & Backtesting framework
export const marketCandles = pgTable("market_candles", {
  id: text("id").primaryKey().notNull(), // symbol_timeframe_timestamp
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  time: bigint("time", { mode: "number" }).notNull(),
  open: doublePrecision("open").notNull(),
  high: doublePrecision("high").notNull(),
  low: doublePrecision("low").notNull(),
  close: doublePrecision("close").notNull(),
  volume: doublePrecision("volume").notNull(),
});

export const marketStructures = pgTable("market_structures", {
  id: text("id").primaryKey().notNull(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  type: text("type").notNull(), // SWING_HIGH, SWING_LOW, BOS_BULL, BOS_BEAR, CHOCH_BULL, CHOCH_BEAR
  price: doublePrecision("price").notNull(),
  time: bigint("time", { mode: "number" }).notNull(),
  strength: doublePrecision("strength").default(1.0),
});

export const liquidityLevels = pgTable("liquidity_levels", {
  id: text("id").primaryKey().notNull(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  type: text("type").notNull(), // PDH, PDL, PWH, PWL, EQH, EQL, SWING_HIGH, SWING_LOW
  price: doublePrecision("price").notNull(),
  strength: doublePrecision("strength").notNull(),
  isSwept: boolean("is_swept").default(false).notNull(),
  time: bigint("time", { mode: "number" }).notNull(),
});

export const zones = pgTable("zones", {
  id: text("id").primaryKey().notNull(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  type: text("type").notNull(), // DEMAND, SUPPLY, FVG_BULL, FVG_BEAR
  topPrice: doublePrecision("top_price").notNull(),
  bottomPrice: doublePrecision("bottom_price").notNull(),
  time: bigint("time", { mode: "number" }).notNull(),
  isFresh: boolean("is_fresh").default(true).notNull(),
  testCount: doublePrecision("test_count").default(0).notNull(),
  volumeConfirm: doublePrecision("volume_confirm").default(1.0),
});

export const setups = pgTable("setups", {
  id: text("id").primaryKey().notNull(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  direction: text("direction").notNull(), // LONG, SHORT, NO_TRADE
  status: text("status").notNull(), // ACTIVE, EXPIRED, INVALIDATED
  setupScore: doublePrecision("setup_score").notNull(),
  entryScore: doublePrecision("entry_score").notNull(),
  finalScore: doublePrecision("final_score").notNull(),
  reasons: jsonb("reasons").notNull(), // string[]
  time: bigint("time", { mode: "number" }).notNull(),
});

export const signals = pgTable("signals", {
  id: text("id").primaryKey().notNull(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  direction: text("direction").notNull(), // LONG, SHORT, NO_TRADE
  status: text("status").notNull(), // WATCHING, CONFIRMING, ACTIVE, TP1_HIT, TP2_HIT, TP3_HIT, STOPPED, INVALIDATED, EXPIRED, NO_TRADE
  entry: doublePrecision("entry").notNull(),
  stopLoss: doublePrecision("stop_loss").notNull(),
  tp1: doublePrecision("tp1").notNull(),
  tp2: doublePrecision("tp2").notNull(),
  tp3: doublePrecision("tp3").notNull(),
  riskReward: doublePrecision("risk_reward").notNull(),
  marketRegime: text("market_regime").notNull(),
  invalidation: text("invalidation").notNull(),
  time: bigint("time", { mode: "number" }).notNull(),
});

export const signalEvents = pgTable("signal_events", {
  id: text("id").primaryKey().notNull(),
  signalId: text("signal_id").references(() => signals.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // TRANSITION, UPDATE, NOTE
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  price: doublePrecision("price").notNull(),
  detail: text("detail").notNull(),
  time: bigint("time", { mode: "number" }).notNull(),
});

export const signalResults = pgTable("signal_results", {
  id: text("id").primaryKey().notNull(),
  signalId: text("signal_id").references(() => signals.id, { onDelete: "cascade" }),
  result: text("result").notNull(), // WIN, LOSS, BE, EXPIRED, INVALIDATED
  profitPct: doublePrecision("profit_pct"),
  rMultiple: doublePrecision("r_multiple"),
  holdingTimeMs: bigint("holding_time_ms", { mode: "number" }),
  mae: doublePrecision("mae"),
  mfe: doublePrecision("mfe"),
  time: bigint("time", { mode: "number" }).notNull(),
});

export const backtestRuns = pgTable("backtest_runs", {
  id: text("id").primaryKey().notNull(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  startTime: bigint("start_time", { mode: "number" }).notNull(),
  endTime: bigint("end_time", { mode: "number" }).notNull(),
  totalTrades: doublePrecision("total_trades").notNull(),
  winRate: doublePrecision("win_rate").notNull(),
  profitFactor: doublePrecision("profit_factor").notNull(),
  maxDrawdown: doublePrecision("max_drawdown").notNull(),
  expectancy: doublePrecision("expectancy").notNull(),
  sharpeRatio: doublePrecision("sharpe_ratio").notNull(),
  runTime: timestamp("run_time").defaultNow().notNull(),
});

export const backtestTrades = pgTable("backtest_trades", {
  id: text("id").primaryKey().notNull(),
  runId: text("run_id").references(() => backtestRuns.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  entryTime: bigint("entry_time", { mode: "number" }).notNull(),
  closeTime: bigint("close_time", { mode: "number" }).notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  exitPrice: doublePrecision("exit_price").notNull(),
  stopLoss: doublePrecision("stop_loss").notNull(),
  takeProfit1: doublePrecision("take_profit_1").notNull(),
  takeProfit2: doublePrecision("take_profit_2").notNull(),
  takeProfit3: doublePrecision("take_profit_3").notNull(),
  rMultiple: doublePrecision("r_multiple").notNull(),
  result: text("result").notNull(), // WIN, LOSS, BE
  marketRegime: text("market_regime").notNull(),
  setupType: text("setup_type").notNull(),
});

export const strategyMetrics = pgTable("strategy_metrics", {
  id: text("id").primaryKey().notNull(),
  backtestId: text("backtest_id").references(() => backtestRuns.id, { onDelete: "cascade" }),
  metricName: text("metric_name").notNull(), // e.g. "WIN_RATE_BULLISH_TREND", "PF_15M"
  metricValue: doublePrecision("metric_value").notNull(),
});
