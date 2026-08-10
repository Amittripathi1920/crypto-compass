import { pgSchema, pgTable, text, timestamp, boolean, doublePrecision, bigint, jsonb, uuid } from "drizzle-orm/pg-core";

// Define the neon_auth schema managed by Neon Auth
export const authSchema = pgSchema("neon_auth");

// Better Auth tables inside neon_auth schema (aligned with exact database columns)
export const user = authSchema.table("user", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(), // camelCase column
  image: text("image"),
  createdAt: timestamp("createdAt").defaultNow().notNull(), // camelCase column
  updatedAt: timestamp("updatedAt").defaultNow().notNull() // camelCase column
});

export const session = authSchema.table("session", {
  id: uuid("id").primaryKey().defaultRandom().notNull(), // UUID primary key
  expiresAt: timestamp("expiresAt").notNull(), // camelCase column
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(), // camelCase column
  updatedAt: timestamp("updatedAt").notNull(), // camelCase column
  ipAddress: text("ipAddress"), // camelCase column
  userAgent: text("userAgent"), // camelCase column
  userId: uuid("userId").notNull().references(() => user.id, { onDelete: "cascade" }) // camelCase column
});

export const account = authSchema.table("account", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: uuid("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").notNull()
});

export const verification = authSchema.table("verification", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
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
  history: jsonb("history").notNull()
});
