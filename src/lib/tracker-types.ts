import type { Timeframe } from "./coins";

export type TradeStatus = "PENDING" | "ACTIVE" | "TP1_HIT" | "TP2_HIT" | "SL_HIT" | "BE_HIT" | "CANCELLED" | "MISSED";

export type TrackerHistoryLog = {
  time: number;
  status: TradeStatus;
  price: number;
  detail: string;
};

export type TrackedTrade = {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  direction: "LONG" | "SHORT";
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  leverage: number;
  balance: number;
  entryTime: number; // timestamp when tracked
  fillTime?: number; // timestamp when entry price was filled
  closeTime?: number; // timestamp when trade hit final TP2, SL, BE or was cancelled
  status: TradeStatus;
  currentPrice?: number;
  history: TrackerHistoryLog[];
};
