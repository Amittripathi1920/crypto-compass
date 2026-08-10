import React, { useState } from "react";
import { useTradeTracker } from "@/hooks/useTradeTracker";
import type { TrackedTrade } from "@/lib/tracker-types";
import { cn } from "@/lib/utils";
import { fmtPrice } from "../signal/format";
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RotateCw, 
  Trash2, 
  History, 
  Target, 
  TrendingUp, 
  ChevronDown,
  ChevronUp
} from "lucide-react";

export function TradeTrackerCard() {
  const { trades, isValidating, cancelTrade, removeTrade, refreshValidation } = useTradeTracker();
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);

  const getUnrealizedPnL = (trade: TrackedTrade) => {
    if (!trade.currentPrice || trade.status === "PENDING") return null;
    const isLong = trade.direction === "LONG";
    const priceChangePct = ((trade.currentPrice - trade.entry) / trade.entry) * 100 * (isLong ? 1 : -1);
    const levChangePct = priceChangePct * trade.leverage;
    const pnlDollars = trade.balance * (levChangePct / 100);

    return {
      pnl: pnlDollars,
      pct: levChangePct,
      formatted: `${pnlDollars >= 0 ? "+" : ""}$${pnlDollars.toFixed(2)} (${pnlDollars >= 0 ? "+" : ""}${levChangePct.toFixed(2)}%)`,
      color: pnlDollars >= 0 ? "text-bull" : "text-bear",
    };
  };

  const activeTrades = trades.filter(
    (t) => t.status === "PENDING" || t.status === "ACTIVE" || t.status === "TP1_HIT"
  );
  
  const historyTrades = trades.filter(
    (t) => t.status === "SL_HIT" || t.status === "TP2_HIT" || t.status === "BE_HIT" || t.status === "CANCELLED" || t.status === "MISSED"
  );

  const toggleExpand = (id: string) => {
    setExpandedTrade(expandedTrade === id ? null : id);
  };

  const getStatusBadge = (status: TrackedTrade["status"]) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-400">
            <Play className="h-3 w-3 animate-pulse" /> Pending Fill
          </span>
        );
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <TrendingUp className="h-3 w-3" /> Active
          </span>
        );
      case "TP1_HIT":
        return (
          <span className="inline-flex items-center gap-1 rounded border border-bull/40 bg-bull/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bull">
            <Target className="h-3 w-3" /> TP1 Hit (BE Stop)
          </span>
        );
      case "TP2_HIT":
        return (
          <span className="inline-flex items-center gap-1 rounded border border-bull/60 bg-bull/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bull">
            <CheckCircle2 className="h-3 w-3" /> TP2 Hit (Win)
          </span>
        );
      case "SL_HIT":
        return (
          <span className="inline-flex items-center gap-1 rounded border border-bear/55 bg-bear/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bear">
            <XCircle className="h-3 w-3" /> SL Hit (Loss)
          </span>
        );
      case "BE_HIT":
        return (
          <span className="inline-flex items-center gap-1 rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-500">
            <AlertTriangle className="h-3 w-3" /> Stopped BE
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cancelled
          </span>
        );
      case "MISSED":
        return (
          <span className="inline-flex items-center gap-1 rounded border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400">
            <XCircle className="h-3 w-3" /> Missed (No Fill)
          </span>
        );
      default:
        return null;
    }
  };

  const calculateTradeResult = (trade: TrackedTrade) => {
    const isLong = trade.direction === "LONG";
    const priceRiskPct = Math.abs(trade.entry - trade.stopLoss) / trade.entry;
    const riskAmount = trade.balance * trade.leverage * priceRiskPct;

    if (trade.status === "TP2_HIT") {
      const t1Reward = (Math.abs(trade.target1 - trade.entry) / trade.entry) / priceRiskPct;
      const t2Reward = (Math.abs(trade.target2 - trade.entry) / trade.entry) / priceRiskPct;
      const totalR = 0.5 * t1Reward + 0.5 * t2Reward;
      const pnl = totalR * riskAmount;
      return { r: `+${totalR.toFixed(2)}R`, pnl: `+$${pnl.toFixed(2)}`, color: "text-bull" };
    }

    if (trade.status === "BE_HIT") {
      const t1Reward = (Math.abs(trade.target1 - trade.entry) / trade.entry) / priceRiskPct;
      const totalR = 0.5 * t1Reward; // second half exited at entry (0R)
      const pnl = totalR * riskAmount;
      return { r: `+${totalR.toFixed(2)}R`, pnl: `+$${pnl.toFixed(2)}`, color: "text-yellow-500" };
    }

    if (trade.status === "SL_HIT") {
      return { r: "-1.00R", pnl: `-$${riskAmount.toFixed(2)}`, color: "text-bear" };
    }

    if (trade.status === "MISSED") {
      return { r: "0.00R", pnl: "$0.00", color: "text-muted-foreground" };
    }

    return { r: "0.00R", pnl: "$0.00", color: "text-muted-foreground" };
  };

  return (
    <section className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4.5 w-4.5 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground">
            Live Position Tracker
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex rounded-md bg-muted/20 p-0.5 border border-border/40 text-[10px] font-semibold uppercase tracking-wider">
            <button
              onClick={() => setActiveTab("active")}
              className={cn(
                "rounded px-3 py-1 transition-colors",
                activeTab === "active" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Active ({activeTrades.length})
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={cn(
                "rounded px-3 py-1 transition-colors",
                activeTab === "history" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Closed ({historyTrades.length})
            </button>
          </div>

          {/* Sync Button */}
          {activeTrades.length > 0 && activeTab === "active" && (
            <button
              onClick={refreshValidation}
              disabled={isValidating}
              className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background/50 hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Sync tracked positions with live exchange candles"
            >
              <RotateCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} />
            </button>
          )}
        </div>
      </div>

      {activeTab === "active" ? (
        <div className="space-y-3">
          {activeTrades.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No active trades tracked. Track a live trade setup using the sizing calculator.
            </div>
          ) : (
            activeTrades.map((t) => {
              const isExpanded = expandedTrade === t.id;
              const isLong = t.direction === "LONG";
              return (
                <div
                  key={t.id}
                  className={cn(
                    "rounded-lg border bg-background/30 p-3 transition-colors",
                    isLong ? "border-bull/20 hover:border-bull/30" : "border-bear/20 hover:border-bear/30"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xs font-bold uppercase", isLong ? "text-bull" : "text-bear")}>
                          {isLong ? "▲ LONG" : "▼ SHORT"}
                        </span>
                        <span className="font-semibold text-sm text-foreground">
                          {t.symbol}/USDT
                        </span>
                        <span className="text-[10px] bg-muted/40 px-1.5 py-0.25 rounded text-muted-foreground">
                          {t.timeframe.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 tabular">
                        Size: ${(t.balance * t.leverage).toLocaleString(undefined, { maximumFractionDigits: 2 })} ({t.leverage}x leverage) · Margin: ${t.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                      {t.currentPrice && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] tabular">
                          <span className="text-muted-foreground">Live Price:</span>
                          <span className="font-bold text-foreground">${fmtPrice(t.currentPrice)}</span>
                          {t.status !== "PENDING" && (() => {
                            const pnlInfo = getUnrealizedPnL(t);
                            if (!pnlInfo) return null;
                            return (
                              <>
                                <span className="text-muted-foreground/60 font-light">|</span>
                                <span className="text-muted-foreground">Unrealized P&L:</span>
                                <span className={cn("font-bold", pnlInfo.color)}>{pnlInfo.formatted}</span>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {getStatusBadge(t.status)}
                      <button
                        onClick={() => cancelTrade(t.id)}
                        className="rounded border border-border px-2 py-0.75 text-[9px] font-semibold uppercase tracking-wider hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => toggleExpand(t.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Core Levels Row */}
                  <div className="mt-3 grid grid-cols-4 gap-2 pt-2.5 border-t border-border/40 text-center text-[10px] tabular">
                    <div>
                      <span className="text-muted-foreground block">Entry</span>
                      <span className="font-bold text-foreground block mt-0.5">${fmtPrice(t.entry)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Stop Loss</span>
                      <span className="font-bold text-bear block mt-0.5">${fmtPrice(t.stopLoss)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Target 1</span>
                      <span className="font-bold text-bull block mt-0.5">${fmtPrice(t.target1)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Target 2</span>
                      <span className="font-bold text-bull block mt-0.5">${fmtPrice(t.target2)}</span>
                    </div>
                  </div>

                  {/* Collapsible History Logs */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/40 bg-muted/10 rounded p-2.5 space-y-2">
                      <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Position Log history
                      </p>
                      <ul className="space-y-1.5 text-[10px]">
                        {t.history.map((log, idx) => (
                          <li key={idx} className="flex justify-between items-start gap-3">
                            <span className="text-muted-foreground tabular shrink-0">
                              {new Date(log.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="text-foreground/95 flex-1">{log.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-background/5">
          {historyTrades.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No closed positions in history.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/80 bg-muted/15 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  <th className="p-3">Asset</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Levels (Entry/SL/Targets)</th>
                  <th className="p-3">Size</th>
                  <th className="p-3">Result</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-xs tabular">
                {historyTrades.map((t) => {
                  const isExpanded = expandedTrade === t.id;
                  const isLong = t.direction === "LONG";
                  const result = calculateTradeResult(t);
                  return (
                    <React.Fragment key={t.id}>
                      <tr className="hover:bg-muted/5 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{t.symbol}/USDT</span>
                            <span className="text-[9px] bg-muted/40 px-1 py-0.25 rounded text-muted-foreground">
                              {t.timeframe.toUpperCase()}
                            </span>
                          </div>
                          {t.currentPrice && (
                            <span className="text-[10px] text-muted-foreground block mt-0.5 tabular">
                              Live: <span className="font-semibold text-foreground">${fmtPrice(t.currentPrice)}</span>
                            </span>
                          )}
                          <span className="text-[9px] text-muted-foreground block mt-0.5">
                            {new Date(t.entryTime).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={cn("text-[10px] font-bold uppercase", isLong ? "text-bull" : "text-bear")}>
                              {isLong ? "▲ LONG" : "▼ SHORT"}
                            </span>
                            {getStatusBadge(t.status)}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                            <span>Entry: <strong className="text-foreground">${fmtPrice(t.entry)}</strong></span>
                            <span>SL: <strong className="text-bear">${fmtPrice(t.stopLoss)}</strong></span>
                            <span>T1: <strong className="text-bull">${fmtPrice(t.target1)}</strong> / T2: <strong className="text-bull">${fmtPrice(t.target2)}</strong></span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="text-[10px]">
                            <span className="text-foreground block font-medium">
                              ${(t.balance * t.leverage).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-muted-foreground block mt-0.5 text-[9px]">
                              {t.leverage}x (${t.balance.toLocaleString()} margin)
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold leading-tight">
                            <p className={cn("font-bold text-sm", result.color)}>{result.pnl}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{result.r}</p>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => toggleExpand(t.id)}
                              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/40 transition-colors"
                              title="Toggle Log History"
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => removeTrade(t.id)}
                              className="text-muted-foreground hover:text-bear p-1 rounded hover:bg-bear/10 transition-colors"
                              title="Remove from history"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/5">
                          <td colSpan={6} className="p-3">
                            <div className="space-y-1.5 pl-2 border-l-2 border-border">
                              <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                                Position Log History
                              </p>
                              <ul className="space-y-1 text-[10px]">
                                {t.history.map((log, idx) => (
                                  <li key={idx} className="flex gap-4">
                                    <span className="text-muted-foreground tabular shrink-0">
                                      {new Date(log.time).toLocaleDateString()} {new Date(log.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                    <span className="text-foreground/90 flex-1">{log.detail}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
