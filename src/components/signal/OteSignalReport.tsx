import { useState, useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  MinusCircle,
  Target,
  ShieldAlert,
  Crosshair,
  Share2,
  CheckCircle2,
  XCircle,
  Flame,
  Layers,
  Zap,
  TrendingUp,
  Activity,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { OteSignal } from "@/lib/ote-engine/types";
import { PriceChart } from "./PriceChart";
import { ExchangeStatus } from "./ExchangeStatus";
import { fmtPct, fmtPrice } from "./format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function OteSignalReport({ result }: { result: OteSignal }) {
  const isLong = result.direction === "LONG";
  const isShort = result.direction === "SHORT";
  const isNoTrade = result.direction === "NO TRADE";

  const dirColor = isLong ? "text-bull" : isShort ? "text-bear" : "text-muted-foreground";
  const DirIcon = isLong ? ArrowUpRight : isShort ? ArrowDownRight : MinusCircle;

  const levels = useMemo(() => {
    if (isNoTrade) return [];
    const list = [
      { label: "ENTRY", value: result.entry.entryPrice, color: "var(--primary)" },
      { label: "STOP", value: result.stopLoss.stopLossPrice, color: "var(--bear)" },
      { label: "TP1 (BE)", value: result.targets.tp1.price, color: "var(--bull)" },
      { label: "TP2 (MAIN)", value: result.targets.tp2.price, color: "var(--bull)" },
      { label: "TP3 (RUNNER)", value: result.targets.tp3.price, color: "var(--bull)" },
    ];
    if (result.fibZone) {
      list.push({ label: "OTE 61.8%", value: result.fibZone.fib618, color: "#f59e0b" });
      list.push({ label: "OTE 78.6%", value: result.fibZone.fib786, color: "#d97706" });
    }
    return list;
  }, [result, isNoTrade]);

  const handleShare = async () => {
    const emoji = isLong ? "📈" : isShort ? "📉" : "⚪";
    const text = isNoTrade
      ? `⚪ INSTITUTIONAL OTE: ${result.symbol}/USDT (${result.timeframe.toUpperCase()})
Status: NO TRADE (Capital Preservation)
HTF Macro: ${result.htfBias}
Blockers: ${result.blockers.join("; ")}
Crypto Compass Lab OTE Engine v2.`
      : `${emoji} INSTITUTIONAL OTE SETUP: ${result.symbol}/USDT (${result.timeframe.toUpperCase()})
Grade: ${result.setupGrade} | Direction: ${result.direction} (Quality: ${result.qualityScore}/100)
Current Price: $${fmtPrice(result.currentPrice)}
🎯 Entry: ${result.entry.type} @ $${fmtPrice(result.entry.entryPrice)}
📍 Zone: $${fmtPrice(result.entry.entryZone.min)} - $${fmtPrice(result.entry.entryZone.max)}
🛡️ Protected Stop: $${fmtPrice(result.stopLoss.stopLossPrice)} (-${result.stopLoss.stopDistancePct}%)
🥇 TP1 (De-Risk/BE): $${fmtPrice(result.targets.tp1.price)} (${result.targets.tp1.rMultiple}R)
🥈 TP2 (Major Pool): $${fmtPrice(result.targets.tp2.price)} (${result.targets.tp2.rMultiple}R net)
🥉 TP3 (Macro Runner): $${fmtPrice(result.targets.tp3.price)} (${result.targets.tp3.rMultiple}R)
⚡ Sweep: ${result.sweep ? `${result.sweep.levelType} at $${fmtPrice(result.sweep.price)}` : "None"}
Summary: ${result.summary}
Invalidation: ${result.invalidation}
Crypto Compass Lab OTE Engine v2.`;

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast.success("Copied Institutional OTE trade card to clipboard!");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <section
        className={cn(
          "relative overflow-hidden rounded-xl border p-5",
          isLong ? "border-bull/40" : isShort ? "border-bear/40" : "border-border",
        )}
        style={{
          background:
            "linear-gradient(160deg, color-mix(in oklab, var(--card) 92%, transparent), var(--background))",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                Smart Money OTE v2
              </span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                · {result.symbol}/USDT ({result.timeframe.toUpperCase()})
              </span>
            </div>

            <div className={cn("mt-1.5 flex items-center gap-2.5", dirColor)}>
              <DirIcon className="h-8 w-8" strokeWidth={2.5} />
              <h2 className="text-4xl font-black tracking-tight">{result.direction}</h2>
              {result.setupGrade !== "NO_SETUP" && (
                <span
                  className={cn(
                    "text-xs font-black uppercase px-2 py-0.5 rounded border ml-2",
                    result.setupGrade === "A+"
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                      : result.setupGrade === "A"
                        ? "border-bull/40 bg-bull/10 text-bull"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-400",
                  )}
                >
                  Grade {result.setupGrade}
                </span>
              )}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              Institutional Quality:{" "}
              <span className="font-semibold text-foreground">{result.qualityScore}/100</span> ·
              Net R:R:{" "}
              <span className="font-semibold text-foreground">
                {result.targets.netRR.toFixed(2)}R
              </span>{" "}
              · HTF: <span className="font-semibold text-foreground">{result.htfBias}</span>
            </p>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Current price
              </p>
              <p className="tabular text-2xl font-bold text-foreground">
                ${fmtPrice(result.currentPrice)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="h-9 gap-1.5 border-border bg-background/50 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-foreground self-center"
            >
              <Share2 className="h-3.5 w-3.5" /> Share OTE
            </Button>
          </div>
        </div>

        {/* 4-Pillar Visual Breakdown Bar */}
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-lg border border-border/40 bg-background/40 p-2.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-semibold flex items-center gap-1">
              <Layers className="h-3 w-3 text-primary" /> 1. Macro Bias
            </span>
            <span className="text-xs font-bold block mt-1 text-foreground">
              {result.htfBias}
            </span>
            <span className="text-[9px] text-muted-foreground block mt-0.5">
              1D/4H Structural Trend
            </span>
          </div>

          <div className="rounded-lg border border-border/40 bg-background/40 p-2.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-semibold flex items-center gap-1">
              <Zap className="h-3 w-3 text-amber-400" /> 2. Liquidity Sweep
            </span>
            <span
              className={cn(
                "text-xs font-bold block mt-1",
                result.sweep ? "text-bull" : "text-muted-foreground",
              )}
            >
              {result.sweep ? `${result.sweep.levelType} Purged` : "No Active Sweep"}
            </span>
            <span className="text-[9px] text-muted-foreground block mt-0.5">
              {result.sweep ? `${result.sweep.rvol}x RVOL Rejection` : "Awaiting stop purge"}
            </span>
          </div>

          <div className="rounded-lg border border-border/40 bg-background/40 p-2.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-semibold flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-primary" /> 3. MSS & Impulse
            </span>
            <span
              className={cn(
                "text-xs font-bold block mt-1",
                result.displacement ? "text-bull" : "text-muted-foreground",
              )}
            >
              {result.displacement
                ? `${result.displacement.displacementAtrRatio}x ATR MSS`
                : "No Displacement"}
            </span>
            <span className="text-[9px] text-muted-foreground block mt-0.5">
              {result.displacement?.fvg ? "FVG Imbalance Formed" : "Market structure break"}
            </span>
          </div>

          <div className="rounded-lg border border-border/40 bg-background/40 p-2.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-semibold flex items-center gap-1">
              <Flame className="h-3 w-3 text-amber-400" /> 4. OTE Retest
            </span>
            <span
              className={cn(
                "text-xs font-bold block mt-1",
                result.fibZone?.inOteZone ? "text-bull" : "text-amber-400",
              )}
            >
              {result.fibZone?.inOteZone
                ? "In 61.8%-78.6% Zone"
                : result.fibZone?.inDiscountOrPremium
                  ? "In Discount/Premium"
                  : "Awaiting Retest"}
            </span>
            <span className="text-[9px] text-muted-foreground block mt-0.5">
              Optimal discount entry
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-foreground/90 font-medium">
          {result.summary}
        </p>
      </section>

      {/* No Trade Rejection Hierarchy vs Trade Levels */}
      {isNoTrade ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/80 bg-card/45 p-6 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground/85" />
          <h4 className="text-sm font-bold text-foreground">No Institutional OTE Setup Triggered</h4>
          <p className="text-xs text-muted-foreground max-w-sm">
            Institutional criteria (Liquidity Sweep $\to$ MSS Displacement $\to$ OTE Retest) not met.
          </p>

          <div className="mt-3 text-left border border-border/30 rounded-lg bg-background/50 p-4 max-w-lg w-full space-y-3">
            {result.blockers.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-widest text-bear block font-bold flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> Institutional Blockers:
                </span>
                <ul className="mt-1 space-y-1 text-xs text-bear/90">
                  {result.blockers.map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-bear font-mono">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.warnings.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-widest text-amber-400 block font-bold flex items-center gap-1">
                  ⚠️ Warnings:
                </span>
                <ul className="mt-1 space-y-1 text-xs text-amber-300/90">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-amber-400 font-mono">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Trade Execution Level Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
              <div className="flex items-center justify-between text-primary">
                <div className="flex items-center gap-1.5">
                  <Crosshair className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-widest font-bold">OTE Entry</span>
                </div>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                  {result.entry.type}
                </span>
              </div>
              <p className="tabular mt-2 text-xl font-black text-foreground">
                ${fmtPrice(result.entry.entryPrice)}
              </p>
              <p className="tabular mt-0.5 text-[10px] text-muted-foreground font-mono">
                Zone: ${fmtPrice(result.entry.entryZone.min)} - ${fmtPrice(result.entry.entryZone.max)}
              </p>
              <p className="mt-1 text-[9px] text-muted-foreground/90 line-clamp-2">
                {result.entry.triggerRule}
              </p>
            </div>

            <div className="rounded-xl border border-bear/40 bg-bear/5 p-4">
              <div className="flex items-center gap-2 text-bear">
                <ShieldAlert className="h-4 w-4" />
                <span className="text-[10px] uppercase tracking-widest font-bold">
                  Protected Invalidation
                </span>
              </div>
              <p className="tabular mt-2 text-xl font-black text-bear">
                ${fmtPrice(result.stopLoss.stopLossPrice)}
              </p>
              <p className="tabular mt-0.5 text-[10px] text-muted-foreground">
                Risk: {result.stopLoss.stopDistancePct}% ({result.stopLoss.stopDistanceAtr}x ATR)
              </p>
              <p className="mt-1 text-[9px] text-muted-foreground/80 line-clamp-2">
                {result.stopLoss.invalidationStatement}
              </p>
            </div>

            <div className="rounded-xl border border-bull/40 bg-bull/5 p-4">
              <div className="flex items-center gap-2 text-bull">
                <Target className="h-4 w-4" />
                <span className="text-[10px] uppercase tracking-widest font-bold">
                  TP1 (De-Risk / BE)
                </span>
              </div>
              <p className="tabular mt-2 text-xl font-black text-bull">
                ${fmtPrice(result.targets.tp1.price)}
              </p>
              <p className="tabular mt-0.5 text-[10px] text-muted-foreground">
                +{result.targets.tp1.pctGain}% ({result.targets.tp1.rMultiple}R)
              </p>
              <p className="mt-1 text-[9px] text-muted-foreground/90">
                {result.targets.tp1.label}
              </p>
            </div>

            <div className="rounded-xl border border-bull/40 bg-bull/5 p-4">
              <div className="flex items-center gap-2 text-bull">
                <Target className="h-4 w-4" />
                <span className="text-[10px] uppercase tracking-widest font-bold">
                  TP2 (Major Objective)
                </span>
              </div>
              <p className="tabular mt-2 text-xl font-black text-bull">
                ${fmtPrice(result.targets.tp2.price)}
              </p>
              <p className="tabular mt-0.5 text-[10px] text-muted-foreground">
                Net: +{result.targets.tp2.pctGain}% ({result.targets.netRR}R Net)
              </p>
              <p className="mt-1 text-[9px] text-muted-foreground/90">
                {result.targets.tp2.label}
              </p>
            </div>
          </div>

          {/* OTE Golden Zone Fib breakdown */}
          {result.fibZone && (
            <div className="rounded-xl border border-border/70 bg-card/40 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-amber-400" /> Optimal Trade Entry (OTE) Fib Retracement Map
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center">
                <div className="rounded border border-border/40 bg-background/50 p-2">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                    50.0% Equilibrium
                  </span>
                  <span className="text-sm font-bold font-mono block mt-0.5 text-foreground">
                    ${fmtPrice(result.fibZone.fib500)}
                  </span>
                </div>
                <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2">
                  <span className="text-[9px] uppercase tracking-wider text-amber-400 block font-bold">
                    61.8% Golden Pocket
                  </span>
                  <span className="text-sm font-bold font-mono block mt-0.5 text-amber-300">
                    ${fmtPrice(result.fibZone.fib618)}
                  </span>
                </div>
                <div className="rounded border border-primary/40 bg-primary/10 p-2">
                  <span className="text-[9px] uppercase tracking-wider text-primary block font-bold">
                    70.5% OTE Sweet Spot
                  </span>
                  <span className="text-sm font-bold font-mono block mt-0.5 text-primary">
                    ${fmtPrice(result.fibZone.fib705)}
                  </span>
                </div>
                <div className="rounded border border-border/40 bg-background/50 p-2">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                    78.6% Deep Retest
                  </span>
                  <span className="text-sm font-bold font-mono block mt-0.5 text-foreground">
                    ${fmtPrice(result.fibZone.fib786)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Live {result.timeframe.toUpperCase()} Price Action & Strategy Map
        </h3>
        <PriceChart candles={result.candles} levels={levels} />
      </section>

      {/* Exchange status */}
      <ExchangeStatus
        attempts={result.dataSource.attempts}
        candleSource={result.dataSource.exchange}
        tickerSource={result.dataSource.exchange}
      />
    </div>
  );
}
