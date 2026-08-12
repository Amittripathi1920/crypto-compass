import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db";
import { trackedTrades, user, session } from "./db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";

// Zod Schema matching tracker types
const TrackedTradeSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  timeframe: z.enum(["5m", "15m", "1h", "4h", "8h", "1d", "1w"]),
  direction: z.enum(["LONG", "SHORT"]),
  entry: z.number(),
  stopLoss: z.number(),
  target1: z.number(),
  target2: z.number(),
  leverage: z.number(),
  balance: z.number(),
  entryTime: z.number(),
  fillTime: z.number().optional(),
  closeTime: z.number().optional(),
  status: z.enum(["PENDING", "ACTIVE", "TP1_HIT", "TP2_HIT", "SL_HIT", "BE_HIT", "CANCELLED", "MISSED"]),
  currentPrice: z.number().optional(),
  history: z.array(
    z.object({
      time: z.number(),
      status: z.enum(["PENDING", "ACTIVE", "TP1_HIT", "TP2_HIT", "SL_HIT", "BE_HIT", "CANCELLED", "MISSED"]),
      price: z.number(),
      detail: z.string(),
    })
  ),
});

const InputSchema = z.array(TrackedTradeSchema);

// Existing offline-guest validation action
export const validateTrades = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { validateActiveTrades } = await import("./tracker.server");
    return validateActiveTrades(data as any);
  });

// Validate user session token directly against database
async function getSessionUser(token: string) {
  if (!token) return null;

  try {
    const [row] = await db
      .select({ user })
      .from(session)
      .innerJoin(user, eq(session.userId, user.id))
      .where(eq(session.token, token));

    return row?.user || null;
  } catch (e) {
    console.error("[tracker] Failed to fetch session from db:", e);
    return null;
  }
}

// Fetch all database trades for authenticated user
export const getUserTrades = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ token: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const user = await getSessionUser(data.token);
    if (!user) return [];

    const rows = await db
      .select()
      .from(trackedTrades)
      .where(eq(trackedTrades.userId, user.id))
      .orderBy(desc(trackedTrades.entryTime));

    return rows.map((r) => ({
      ...r,
      fillTime: r.fillTime ?? undefined,
      closeTime: r.closeTime ?? undefined,
      currentPrice: r.currentPrice ?? undefined,
      timeframe: r.timeframe as any,
      direction: r.direction as any,
      status: r.status as any,
      history: r.history as any,
    }));
  });

// Sync and validate active database trades with live price wicks
export const syncUserTrades = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ token: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const user = await getSessionUser(data.token);
    if (!user) return [];

    // Fetch active rows from db
    const activeRows = await db
      .select()
      .from(trackedTrades)
      .where(
        and(
          eq(trackedTrades.userId, user.id),
          inArray(trackedTrades.status, ["PENDING", "ACTIVE", "TP1_HIT"])
        )
      );

    if (activeRows.length > 0) {
      const { validateActiveTrades } = await import("./tracker.server");
      const typedActive = activeRows.map((r) => ({
        ...r,
        fillTime: r.fillTime ?? undefined,
        closeTime: r.closeTime ?? undefined,
        currentPrice: r.currentPrice ?? undefined,
        timeframe: r.timeframe as any,
        direction: r.direction as any,
        status: r.status as any,
        history: r.history as any,
      }));

      const updated = await validateActiveTrades(typedActive);

      // Write any modified status back to the database
      for (const trade of updated) {
        const original = activeRows.find((r) => r.id === trade.id);
        if (original && (original.status !== trade.status || original.currentPrice !== trade.currentPrice)) {
          await db
            .update(trackedTrades)
            .set({
              status: trade.status,
              fillTime: trade.fillTime,
              closeTime: trade.closeTime,
              currentPrice: trade.currentPrice,
              history: trade.history,
            })
            .where(eq(trackedTrades.id, trade.id));
        }
      }
    }

    // Return the full updated trades list
    const allRows = await db
      .select()
      .from(trackedTrades)
      .where(eq(trackedTrades.userId, user.id))
      .orderBy(desc(trackedTrades.entryTime));

    return allRows.map((r) => ({
      ...r,
      fillTime: r.fillTime ?? undefined,
      closeTime: r.closeTime ?? undefined,
      currentPrice: r.currentPrice ?? undefined,
      timeframe: r.timeframe as any,
      direction: r.direction as any,
      status: r.status as any,
      history: r.history as any,
    }));
  });

// Insert trade setup into database
export const dbTrackTrade = createServerFn({ method: "POST" })
  .validator(
    z.object({
      trade: TrackedTradeSchema,
      token: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser(data.token);
    if (!user) throw new Error("Unauthorized");

    await db.insert(trackedTrades).values({
      id: data.trade.id,
      userId: user.id,
      symbol: data.trade.symbol,
      timeframe: data.trade.timeframe,
      direction: data.trade.direction,
      entry: data.trade.entry,
      stopLoss: data.trade.stopLoss,
      target1: data.trade.target1,
      target2: data.trade.target2,
      leverage: data.trade.leverage,
      balance: data.trade.balance,
      entryTime: data.trade.entryTime,
      fillTime: data.trade.fillTime,
      closeTime: data.trade.closeTime,
      status: data.trade.status,
      currentPrice: data.trade.currentPrice,
      history: data.trade.history,
    });

    return { success: true };
  });

// Cancel active database position
export const dbCancelTrade = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), token: z.string() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser(data.token);
    if (!user) throw new Error("Unauthorized");

    // Fetch the trade first to append to its history
    const [original] = await db
      .select()
      .from(trackedTrades)
      .where(and(eq(trackedTrades.id, data.id), eq(trackedTrades.userId, user.id)));

    if (!original) throw new Error("Trade record not found");

    const history = (original.history as any[]) || [];
    history.push({
      time: Date.now(),
      status: "CANCELLED",
      price: original.entry,
      detail: "Position manually cancelled by user.",
    });

    await db
      .update(trackedTrades)
      .set({
        status: "CANCELLED",
        closeTime: Date.now(),
        history,
      })
      .where(and(eq(trackedTrades.id, data.id), eq(trackedTrades.userId, user.id)));

    return { success: true };
  });

// Delete trade from database history
export const dbRemoveTrade = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), token: z.string() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser(data.token);
    if (!user) throw new Error("Unauthorized");

    await db
      .delete(trackedTrades)
      .where(and(eq(trackedTrades.id, data.id), eq(trackedTrades.userId, user.id)));

    return { success: true };
  });
