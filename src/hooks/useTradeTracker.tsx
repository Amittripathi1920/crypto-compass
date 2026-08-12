import { createContext, useContext, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useSession, authClient } from "@/lib/auth-client";
import { 
  validateTrades, 
  getUserTrades, 
  syncUserTrades, 
  dbTrackTrade, 
  dbCancelTrade, 
  dbRemoveTrade 
} from "@/lib/tracker.functions";
import type { TrackedTrade, TradeStatus } from "@/lib/tracker-types";
import { toast } from "sonner";

const STORAGE_KEY = "crypto_compass_tracked_trades";

interface TradeTrackerContextType {
  trades: TrackedTrade[];
  isValidating: boolean;
  isLoggedIn: boolean;
  trackTrade: (tradeData: Omit<TrackedTrade, "id" | "entryTime" | "status" | "history">) => Promise<void>;
  cancelTrade: (id: string) => Promise<void>;
  removeTrade: (id: string) => Promise<void>;
  refreshValidation: () => Promise<void>;
}

const TradeTrackerContext = createContext<TradeTrackerContextType | undefined>(undefined);

export function TradeTrackerProvider({ children }: { children: React.ReactNode }) {
  const { data: sessionData, isPending: isSessionLoading } = useSession();
  const isLoggedIn = !!sessionData?.user;

  const getJwtToken = async () => {
    try {
      const res = await authClient.token();
      return res.data?.token || "";
    } catch (e) {
      console.error("[tracker] Failed to retrieve JWT token:", e);
      return "";
    }
  };

  const [trades, setTrades] = useState<TrackedTrade[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Server functions
  const triggerValidation = useServerFn(validateTrades);
  const getDbTrades = useServerFn(getUserTrades);
  const syncDbTrades = useServerFn(syncUserTrades);
  const trackDbTrade = useServerFn(dbTrackTrade);
  const cancelDbTrade = useServerFn(dbCancelTrade);
  const removeDbTrade = useServerFn(dbRemoveTrade);

  // Load trades on mount / session load
  const loadTrades = async () => {
    if (isSessionLoading) return;

    if (isLoggedIn) {
      setIsValidating(true);
      try {
        const jwt = await getJwtToken();
        const rows = await getDbTrades({ data: { token: jwt } });
        setTrades(rows as any);
      } catch (e) {
        console.error("[tracker] Failed to fetch trades from db:", e);
        toast.error("Failed to load positions from database.");
      } finally {
        setIsValidating(false);
      }
    } else if (!isSessionLoading) {
      // Guest local storage fallback
      try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
          setTrades(JSON.parse(data));
        } else {
          setTrades([]);
        }
      } catch (e) {
        console.error("[tracker] Failed to load trades from storage:", e);
      }
    }
  };

  useEffect(() => {
    loadTrades();
  }, [isLoggedIn, isSessionLoading]);

  const saveLocalTrades = (newTrades: TrackedTrade[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newTrades));
      setTrades(newTrades);
    } catch (e) {
      console.error("[tracker] Failed to save trades to storage:", e);
    }
  };

  const trackTrade = async (
    tradeData: Omit<TrackedTrade, "id" | "entryTime" | "status" | "history">
  ) => {
    // Check duplication
    const exists = trades.some(
      (t) =>
        t.symbol === tradeData.symbol &&
        t.timeframe === tradeData.timeframe &&
        (t.status === "PENDING" || t.status === "ACTIVE" || t.status === "TP1_HIT")
    );

    if (exists) {
      toast.error(`Already tracking an active trade for ${tradeData.symbol} on ${tradeData.timeframe}`);
      return;
    }

    const newTrade: TrackedTrade = {
      ...tradeData,
      id: Math.random().toString(36).substring(2, 11),
      entryTime: Date.now(),
      status: "PENDING",
      history: [
        {
          time: Date.now(),
          status: "PENDING",
          price: tradeData.entry,
          detail: `Trade setup tracked. Limit order set at $${tradeData.entry.toLocaleString()}`,
        },
      ],
    };

    if (isLoggedIn) {
      setIsValidating(true);
      try {
        const jwt = await getJwtToken();
        if (!jwt) throw new Error("Could not retrieve authentication token.");
        await trackDbTrade({ data: { trade: newTrade, token: jwt } });
        setTrades([newTrade, ...trades]);
        toast.success(`Position tracked in database: ${tradeData.symbol}/USDT at $${tradeData.entry.toLocaleString()}`);
      } catch (e) {
        console.error("[tracker] Failed to save position to db:", e);
        toast.error("Failed to track position in database.");
      } finally {
        setIsValidating(false);
      }
    } else {
      const list = [newTrade, ...trades];
      saveLocalTrades(list);
      toast.success(`Position tracked locally: ${tradeData.symbol}/USDT at $${tradeData.entry.toLocaleString()}`);
    }
  };

  const cancelTrade = async (id: string) => {
    if (isLoggedIn) {
      setIsValidating(true);
      try {
        const jwt = await getJwtToken();
        if (!jwt) throw new Error("Could not retrieve authentication token.");
        await cancelDbTrade({ data: { id, token: jwt } });
        // Optimistic / Local update for fast UI response
        setTrades(
          trades.map((t) => {
            if (t.id === id) {
              return {
                ...t,
                status: "CANCELLED",
                closeTime: Date.now(),
                history: [
                  ...t.history,
                  {
                    time: Date.now(),
                    status: "CANCELLED",
                    price: t.entry,
                    detail: "Position manually cancelled by user.",
                  },
                ],
              };
            }
            return t;
          })
        );
        toast.success("Position cancelled.");
      } catch (e) {
        console.error("[tracker] Failed to cancel trade in db:", e);
        toast.error("Failed to cancel position in database.");
      } finally {
        setIsValidating(false);
      }
    } else {
      const list = trades.map((t) => {
        if (t.id === id) {
          const history = [...t.history];
          history.push({
            time: Date.now(),
            status: "CANCELLED",
            price: t.entry,
            detail: "Position manually cancelled by user.",
          });
          return {
            ...t,
            status: "CANCELLED" as TradeStatus,
            closeTime: Date.now(),
            history,
          };
        }
        return t;
      });
      saveLocalTrades(list);
      toast.success("Position cancelled.");
    }
  };

  const removeTrade = async (id: string) => {
    if (isLoggedIn) {
      setIsValidating(true);
      try {
        const jwt = await getJwtToken();
        if (!jwt) throw new Error("Could not retrieve authentication token.");
        await removeDbTrade({ data: { id, token: jwt } });
        setTrades(trades.filter((t) => t.id !== id));
        toast.success("Position removed from history.");
      } catch (e) {
        console.error("[tracker] Failed to delete trade in db:", e);
        toast.error("Failed to delete position from database.");
      } finally {
        setIsValidating(false);
      }
    } else {
      const list = trades.filter((t) => t.id !== id);
      saveLocalTrades(list);
      toast.success("Position removed from history.");
    }
  };

  const refreshValidation = async () => {
    if (trades.length === 0) return;
    const active = trades.filter(
      (t) => t.status === "PENDING" || t.status === "ACTIVE" || t.status === "TP1_HIT"
    );
    if (active.length === 0) return;

    setIsValidating(true);
    try {
      if (isLoggedIn) {
        // Sync database active trades on server
        const jwt = await getJwtToken();
        if (!jwt) throw new Error("Could not retrieve authentication token.");
        const updatedList = await syncDbTrades({ data: { token: jwt } });

        // Notify status updates
        updatedList.forEach((newT) => {
          const oldT = trades.find((t) => t.id === newT.id);
          if (oldT && oldT.status !== newT.status) {
            triggerStatusToast(newT);
          }
        });

        setTrades(updatedList as any);
      } else {
        // LocalStorage fallback validation
        const updated = await triggerValidation({ data: active });
        const updatedMap = new Map(updated.map((t) => [t.id, t]));
        const list = trades.map((t) => updatedMap.get(t.id) || t);

        saveLocalTrades(list);

        updated.forEach((newT) => {
          const oldT = trades.find((t) => t.id === newT.id);
          if (oldT && oldT.status !== newT.status) {
            triggerStatusToast(newT);
          }
        });
      }
    } catch (e) {
      console.error("[tracker] Failed to validate trades:", e);
      toast.error("Failed to sync tracked trades with live prices.");
    } finally {
      setIsValidating(false);
    }
  };

  const triggerStatusToast = (trade: TrackedTrade) => {
    if (trade.status === "ACTIVE") {
      toast.success(`🚀 Limit fill: ${trade.symbol}/USDT is now ACTIVE!`);
    } else if (trade.status === "TP1_HIT") {
      toast.success(`🎯 Target 1 Hit! ${trade.symbol}/USDT secured half profits!`);
    } else if (trade.status === "TP2_HIT") {
      toast.success(`🎉 Target 2 Hit! ${trade.symbol}/USDT fully closed in profit!`);
    } else if (trade.status === "SL_HIT") {
      toast.error(`🚨 Stop Loss Hit: ${trade.symbol}/USDT closed.`);
    } else if (trade.status === "BE_HIT") {
      toast.warning(`🛡️ Break-Even Stop Hit: ${trade.symbol}/USDT closed.`);
    } else if (trade.status === "MISSED") {
      toast.warning(`⚠️ Missed Entry: Stop Loss level touched before Entry filled for ${trade.symbol}/USDT.`);
    }
  };

  // Run validation on load and setup interval to fetch live prices periodically
  useEffect(() => {
    if (trades.length === 0) return;

    // Perform initial validation
    refreshValidation();

    // Setup background refresh every 15 seconds
    const interval = setInterval(() => {
      refreshValidation();
    }, 15000);

    return () => clearInterval(interval);
  }, [trades.length, isLoggedIn]);

  return (
    <TradeTrackerContext.Provider
      value={{
        trades,
        isValidating,
        isLoggedIn,
        trackTrade,
        cancelTrade,
        removeTrade,
        refreshValidation,
      }}
    >
      {children}
    </TradeTrackerContext.Provider>
  );
}

export function useTradeTracker() {
  const context = useContext(TradeTrackerContext);
  if (!context) {
    throw new Error("useTradeTracker must be used within a TradeTrackerProvider");
  }
  return context;
}
