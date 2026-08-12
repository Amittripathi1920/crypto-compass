import { useState, useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, MinusCircle, Target, ShieldAlert, Crosshair, Share2, Calculator, CheckCircle2, XCircle } from "lucide-react";
import { useTradeTracker } from "@/hooks/useTradeTracker";
import type { SignalResult } from "@/lib/signal-types";
import { PriceChart } from "./PriceChart";
import { ExchangeStatus } from "./ExchangeStatus";
import { fmtPct, fmtPrice } from "./format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-sm text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function TradeCalculator({
  entry,
  stopLoss,
  target1,
  target2,
  target3,
  direction,
  balance,
  setBalance,
  riskPct,
  setRiskPct,
  isTracked,
  onTrack,
}: {
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3?: number | undefined;
  direction: "LONG" | "SHORT";
  balance: number;
  setBalance: (v: number) => void;
  riskPct: number;
  setRiskPct: (v: number) => void;
  isTracked: boolean;
  onTrack: () => void;
}) {

  const priceRiskPct = (Math.abs(entry - stopLoss) / entry) * 100;
  
  // Standardized Sizing: Controlled by Account Risk % + Stop distance
  const dollarRisk = balance * (riskPct / 100);
  const positionSize = priceRiskPct > 0 ? dollarRisk / (priceRiskPct / 100) : 0;
  const requiredLeverage = balance > 0 ? positionSize / balance : 1;
  const contractUnits = entry > 0 ? positionSize / entry : 0;

  // Estimated profit amounts
  const t1ProfitPct = (Math.abs(target1 - entry) / entry) * 100;
  const t2ProfitPct = (Math.abs(target2 - entry) / entry) * 100;
  const t3ProfitPct = target3 ? (Math.abs(target3 - entry) / entry) * 100 : 0;

  const estProfitT1 = positionSize * (t1ProfitPct / 100);
  const estProfitT2 = positionSize * (t2ProfitPct / 100);
  const estProfitT3 = target3 ? positionSize * (t3ProfitPct / 100) : 0;

  // High leverage warnings
  const isLeverageDangerous = requiredLeverage > 20;

  return (
    <div className="rounded-xl border border-border bg-card/45 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5 text-primary" /> Risk Sizing & Leverage Calculator
        </h4>
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/20 px-2 py-0.5 rounded">
          {direction} Mode
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground block font-medium">
            Account Balance ($)
          </label>
          <input
            type="number"
            value={balance}
            onChange={(e) => setBalance(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-full bg-background/50 border border-border rounded px-3 py-1.5 text-sm font-semibold tabular focus:outline-none focus:border-primary text-foreground"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            <span>Target Account Risk (%)</span>
            <span className="text-primary font-bold text-sm">{riskPct.toFixed(1)}%</span>
          </div>
          <div className="flex flex-col gap-2">
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.5"
              value={riskPct}
              onChange={(e) => setRiskPct(parseFloat(e.target.value) || 1.0)}
              className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer"
            />
            <div className="flex gap-1 justify-between">
              {[0.5, 1.0, 2.0, 3.0, 5.0].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRiskPct(r)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[9px] font-bold transition-colors text-center",
                    riskPct === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  )}
                >
                  {r}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isLeverageDangerous && (
        <div className="rounded border border-red-500/40 bg-red-500/5 px-3 py-2 flex items-center gap-2 text-red-400 text-xs">
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-500 animate-pulse" />
          <span className="font-semibold">
            Warning: Required leverage ({requiredLeverage.toFixed(1)}x) exceeds safe maximum risk bounds (20x). Reduce position risk % or widen entry zone.
          </span>
        </div>
      )}

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 pt-2 border-t border-border/40">
        <div className="p-2 rounded bg-muted/10 border border-border/30">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
            Position Size
          </span>
          <span className="tabular text-sm font-bold text-foreground block mt-0.5">
            ${positionSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="tabular text-[9px] text-muted-foreground block mt-0.5">
            {contractUnits.toFixed(4)} Units
          </span>
        </div>

        <div className="p-2 rounded bg-muted/10 border border-border/30">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
            Required Leverage
          </span>
          <span className={cn("tabular text-sm font-bold block mt-0.5", isLeverageDangerous ? "text-red-400" : "text-foreground")}>
            {requiredLeverage.toFixed(1)}x
          </span>
          <span className="text-[9px] text-muted-foreground block mt-0.5">
            Risk: ${dollarRisk.toFixed(2)}
          </span>
        </div>

        <div className="p-2 rounded bg-bull/5 border border-bull/20">
          <span className="text-[9px] uppercase tracking-wider text-bull block">
            Profit Target 1
          </span>
          <span className="tabular text-sm font-bold text-bull block mt-0.5">
            +${estProfitT1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="tabular text-[9px] text-muted-foreground block mt-0.5">
            {t1ProfitPct.toFixed(1)}% move
          </span>
        </div>

        <div className="p-2 rounded bg-bull/5 border border-bull/20">
          <span className="text-[9px] uppercase tracking-wider text-bull block font-semibold">
            Profit Target 2 / 3
          </span>
          <span className="tabular text-sm font-bold text-bull block mt-0.5">
            +${estProfitT2.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {target3 ? `+$${estProfitT3.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "N/A"}
          </span>
          <span className="tabular text-[9px] text-muted-foreground block mt-0.5">
            Target 2: {t2ProfitPct.toFixed(1)}% move
          </span>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={onTrack}
          className={cn(
            "h-8 px-4 text-xs font-bold uppercase tracking-wider border",
            isTracked
              ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
          )}
        >
          {isTracked ? "✓ Tracking Signal" : "Track Trade Setup"}
        </Button>
      </div>
    </div>
  );
}

export function SignalReport({ result }: { result: SignalResult }) {
  const isLong = result.direction === "LONG";
  const isShort = result.direction === "SHORT";
  const isNoTrade = result.direction === "NO TRADE";
  
  const dirColor = isLong ? "text-bull" : isShort ? "text-bear" : "text-muted-foreground";
  const DirIcon = isLong ? ArrowUpRight : isShort ? ArrowDownRight : MinusCircle;

  const [calcBalance, setCalcBalance] = useState(1000);
  const [calcRiskPct, setCalcRiskPct] = useState(1.0);

  const priceRiskPct = (Math.abs(result.entry - result.stopLoss) / result.entry) * 100;
  const dollarRisk = calcBalance * (calcRiskPct / 100);
  const positionSize = priceRiskPct > 0 ? dollarRisk / (priceRiskPct / 100) : 0;
  const calcLeverage = calcBalance > 0 ? positionSize / calcBalance : 1;

  const { trades, trackTrade, removeTrade } = useTradeTracker();

  const isTracked = useMemo(() => {
    return trades.some(
      (t: any) =>
        t.symbol === result.symbol &&
        t.timeframe === result.timeframe &&
        (t.status === "PENDING" || t.status === "ACTIVE" || t.status === "TP1_HIT")
    );
  }, [trades, result]);

  const handleTrack = () => {
    if (isTracked) {
      const activeT = trades.find(
        (t: any) =>
          t.symbol === result.symbol &&
          t.timeframe === result.timeframe &&
          (t.status === "PENDING" || t.status === "ACTIVE" || t.status === "TP1_HIT")
      );
      if (activeT) {
        removeTrade(activeT.id);
        toast.success("Stopped tracking trade setup");
      }
    } else {
      trackTrade({
        symbol: result.symbol,
        timeframe: result.timeframe,
        direction: result.direction as "LONG" | "SHORT",
        entry: result.entry,
        stopLoss: result.stopLoss,
        target1: result.target1,
        target2: result.target2,
        leverage: calcLeverage,
        balance: calcBalance,
      });
    }
  };

  const getChartImageBlob = async (): Promise<Blob | null> => {
    const svgEl = document.getElementById("price-chart-svg");
    if (!svgEl) return null;
    try {
      const svgStr = new XMLSerializer().serializeToString(svgEl);
      const img = new Image();
      const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      
      return new Promise((resolve) => {
        img.onload = () => {
          URL.revokeObjectURL(url);
          const canvas = document.createElement("canvas");
          canvas.width = 1520;
          canvas.height = 780;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = "#0c0a09"; // Stone-950 dark background color
          ctx.fillRect(0, 0, 1520, 780);
          ctx.drawImage(img, 0, 0, 1520, 780);
          canvas.toBlob((blob) => resolve(blob), "image/png");
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    } catch (e) {
      return null;
    }
  };

  const handleShare = async () => {
    const emoji = isLong ? "📈" : isShort ? "📉" : "⚪";
    const percentage = result.change24hPct >= 0 ? `+${result.change24hPct.toFixed(2)}%` : `${result.change24hPct.toFixed(2)}%`;
    const riskPct = ((Math.abs(result.entry - result.stopLoss) / result.entry) * 100).toFixed(2);
    const target1Pct = ((Math.abs(result.target1 - result.entry) / result.entry) * 100).toFixed(2);
    const sentimentStr = result.sentiment ? `${result.sentiment.value} (${result.sentiment.label})` : "N/A";

    const reasoningText = result.reasoning
      .map((r) => `• [${r.label}] ${r.detail}`)
      .join("\n");

    const text = isNoTrade
      ? `⚪ CRYPTO COMPASS SIGNAL: ${result.symbol}/USDT (${result.timeframe.toUpperCase()})
Direction: NO ACTIVE TRADE SETUP (Capital Preservation)
Current Price: $${fmtPrice(result.currentPrice)} (${percentage} 24h)
Market Regime: ${result.marketRegime}
Summary: ${result.summary}
Generated via Crypto Compass Lab.`
      : `${emoji} CRYPTO COMPASS SIGNAL: ${result.symbol}/USDT (${result.timeframe.toUpperCase()})
Direction: ${result.direction} (Confluence: ${result.finalScore || result.confidence}%)
Current Price: $${fmtPrice(result.currentPrice)} (${percentage} 24h)
Market Regime: ${result.marketRegime}
🎯 Entry Zone: $${fmtPrice(result.entry)}
🛡️ Stop Loss: $${fmtPrice(result.stopLoss)} (Risk: ${riskPct}%)
🥇 Target 1: $${fmtPrice(result.target1)} (Reward: ${target1Pct}%)
🥈 Target 2: $${fmtPrice(result.target2)}
${result.target3 ? `🥉 Target 3: $${fmtPrice(result.target3)}\n` : ""}⚖️ Risk/Reward: ${result.riskReward.toFixed(2)}R
💡 Why This Trend:
${reasoningText}
Summary: ${result.summary}
Invalidation: ${result.invalidation}
Generated via Crypto Compass Lab.`;

    const hasShare = typeof navigator !== "undefined" && !!navigator.share;
    const hasClipboard = typeof navigator !== "undefined" && !!navigator.clipboard;

    const fallbackCopyManual = () => {
      try {
        window.prompt("Copy the trade setup manually:", text);
      } catch (e) {
        toast.error("Sharing blocked by browser security.");
      }
    };

    toast.loading("Generating shareable chart image...", { id: "share-loader" });
    const pngBlob = await getChartImageBlob().catch(() => null);
    toast.dismiss("share-loader");

    if (pngBlob) {
      const file = new File([pngBlob], `${result.symbol}_USDT_${result.timeframe}_Signal.png`, {
        type: "image/png",
      });

      if (hasShare && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${result.symbol}/USDT Setup`,
            text: text,
          });
          toast.success("Signal shared successfully!");
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      if (hasClipboard && typeof ClipboardItem !== "undefined") {
        try {
          const textBlob = new Blob([text], { type: "text/plain" });
          const item = new ClipboardItem({
            "text/plain": textBlob,
            "image/png": pngBlob,
          });
          await navigator.clipboard.write([item]);
          toast.success("Copied signal text AND chart image to clipboard!");
          return;
        } catch (err) {
          console.error("[share] ClipboardItem write failed:", err);
        }
      }
    }

    if (hasShare) {
      try {
        await navigator.share({
          title: `${result.symbol}/USDT Setup`,
          text: text,
        });
        toast.success("Signal shared successfully!");
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          if (hasClipboard) {
            navigator.clipboard.writeText(text);
            toast.success("Copied trade setup card to clipboard!");
          } else {
            fallbackCopyManual();
          }
        }
      }
    } else {
      if (hasClipboard) {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Copied trade setup card to clipboard!");
        } catch (e) {
          fallbackCopyManual();
        }
      } else {
        fallbackCopyManual();
      }
    }
  };

  return (
    <div className="space-y-4">
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
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {result.symbol}/USDT · {result.timeframe} signal
            </p>
            <div className={cn("mt-1 flex items-center gap-2", dirColor)}>
              <DirIcon className="h-7 w-7" strokeWidth={2.5} />
              <h2 className="text-4xl font-bold">{result.direction}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Score Confluence: {result.finalScore || result.confidence}% · R:R {result.riskReward.toFixed(2)} ·{" "}
              {result.modelUsed}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  result.marketRegime.includes("Bullish") || result.marketRegime.includes("STRONG_BULLISH")
                    ? "border-bull/30 bg-bull/10 text-bull"
                    : result.marketRegime.includes("Bearish") || result.marketRegime.includes("STRONG_BEARISH")
                      ? "border-bear/30 bg-bear/10 text-bear"
                      : "border-border bg-muted/20 text-muted-foreground",
                )}
              >
                Regime: {result.marketRegime}
              </span>
              {result.sentiment ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    result.sentiment.value >= 75
                      ? "border-bull/45 bg-bull/15 text-bull"
                      : result.sentiment.value >= 55
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : result.sentiment.value <= 25
                          ? "border-bear/45 bg-bear/15 text-bear"
                          : "border-border bg-muted/20 text-muted-foreground",
                  )}
                >
                  Sentiment: {result.sentiment.value} ({result.sentiment.label})
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Current price
              </p>
              <p className="tabular text-2xl font-semibold text-foreground">
                ${fmtPrice(result.currentPrice)}
              </p>
              <p
                className={cn(
                  "tabular text-xs",
                  result.change24hPct >= 0 ? "text-bull" : "text-bear",
                )}
              >
                {fmtPct(result.change24hPct)} 24h
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="h-9 gap-1.5 border-border bg-background/50 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-foreground self-center"
            >
              <Share2 className="h-3.5 w-3.5" /> Share
            </Button>
          </div>
        </div>

        {/* Triple Confluence Gauges Grid */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/40 bg-background/40 p-2.5 text-center">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
              Setup Quality
            </span>
            <span className="text-base font-bold block text-foreground mt-0.5">
              {result.setupScore || 0}/100
            </span>
            <div className="mt-1.5 h-1 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/80 rounded-full" style={{ width: `${result.setupScore || 0}%` }} />
            </div>
          </div>
          <div className="rounded-lg border border-border/40 bg-background/40 p-2.5 text-center">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
              Entry Trigger
            </span>
            <span className="text-base font-bold block text-foreground mt-0.5">
              {result.entryScore || 0}/100
            </span>
            <div className="mt-1.5 h-1 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/80 rounded-full" style={{ width: `${result.entryScore || 0}%` }} />
            </div>
          </div>
          <div className="rounded-lg border border-border/40 bg-background/40 p-2.5 text-center">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
              Combined Score
            </span>
            <span className={cn("text-base font-bold block mt-0.5", isLong ? "text-bull" : isShort ? "text-bear" : "text-muted-foreground")}>
              {result.finalScore || result.confidence || 0}%
            </span>
            <div className="mt-1.5 h-1 w-full bg-muted rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full", isLong ? "bg-bull" : isShort ? "bg-bear" : "bg-neutral")} style={{ width: `${result.finalScore || result.confidence || 0}%` }} />
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-foreground/90">{result.summary}</p>
      </section>

      {isNoTrade ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card/45 p-6 text-center">
          <ShieldAlert className="h-7 w-7 text-muted-foreground/85" />
          <h4 className="text-sm font-semibold text-foreground">No Trade Setup Triggered</h4>
          <p className="text-xs text-muted-foreground max-w-sm">
            Current market structure does not offer a high-probability confluence sweet spot. Capital preservation is prioritized over low-probability entries.
          </p>
          {result.rejectionReasons && result.rejectionReasons.length > 0 && (
            <div className="mt-3.5 text-left border border-border/30 rounded bg-background/50 p-3 max-w-md w-full space-y-1.5">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground block font-bold">
                Rejection Filters Tripped:
              </span>
              <ul className="list-disc list-inside text-[11px] text-bear space-y-0.5">
                {result.rejectionReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Multi-Timeframe Checklist & Confirmations */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-card/40 p-3 flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                  Volume Expansion
                </span>
                <span className="text-xs text-foreground font-semibold">
                  Relative Vol (RVOL)
                </span>
              </div>
              {result.indicators.volumeRatio >= 1.25 ? (
                <CheckCircle2 className="h-5 w-5 text-bull" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground/45" />
              )}
            </div>

            <div className="rounded-lg border border-border bg-card/40 p-3 flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                  Momentum Alignment
                </span>
                <span className="text-xs text-foreground font-semibold">
                  RSI & MACD stack
                </span>
              </div>
              {result.indicators.rsi >= 40 && result.indicators.rsi <= 70 ? (
                <CheckCircle2 className="h-5 w-5 text-bull" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground/45" />
              )}
            </div>

            <div className="rounded-lg border border-border bg-card/40 p-3 flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                  Structure Confirmation
                </span>
                <span className="text-xs text-foreground font-semibold">
                  BOS / CHoCH present
                </span>
              </div>
              {result.reasoning.some((r) => r.label.includes("Structure")) ? (
                <CheckCircle2 className="h-5 w-5 text-bull" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground/45" />
              )}
            </div>
          </div>

          {/* S/R levels */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-lg border border-primary/45 bg-primary/5 p-3">
              <div className="flex items-center gap-1.5 text-primary">
                <Crosshair className="h-3.5 w-3.5" />
                <p className="text-[10px] uppercase tracking-widest font-semibold">Entry</p>
              </div>
              <p className="tabular mt-1 text-base font-bold text-foreground">
                ${fmtPrice(result.entry)}
              </p>
            </div>
            <div className="rounded-lg border border-bear/45 bg-bear/5 p-3">
              <div className="flex items-center gap-1.5 text-bear">
                <ShieldAlert className="h-3.5 w-3.5" />
                <p className="text-[10px] uppercase tracking-widest font-semibold">Stop loss</p>
              </div>
              <p className="tabular mt-1 text-base font-bold text-foreground">
                ${fmtPrice(result.stopLoss)}
              </p>
              <p className="tabular mt-0.5 text-[9px] text-muted-foreground">
                risk {fmtPct((Math.abs(result.entry - result.stopLoss) / result.entry) * 100)}
              </p>
            </div>
            <div className="rounded-lg border border-bull/45 bg-bull/5 p-3">
              <div className="flex items-center gap-1.5 text-bull">
                <Target className="h-3.5 w-3.5" />
                <p className="text-[10px] uppercase tracking-widest font-semibold">Target 1</p>
              </div>
              <p className="tabular mt-1 text-base font-bold text-foreground">
                ${fmtPrice(result.target1)}
              </p>
              <p className="tabular mt-0.5 text-[9px] text-muted-foreground">
                reward {fmtPct((Math.abs(result.target1 - result.entry) / result.entry) * 100)}
              </p>
            </div>
            <div className="rounded-lg border border-bull/30 bg-bull/5 p-3">
              <div className="flex items-center gap-1.5 text-bull/85">
                <Target className="h-3.5 w-3.5" />
                <p className="text-[10px] uppercase tracking-widest font-semibold">Target 2</p>
              </div>
              <p className="tabular mt-1 text-base font-bold text-foreground">
                ${fmtPrice(result.target2)}
              </p>
              <p className="tabular mt-0.5 text-[9px] text-muted-foreground">
                {result.riskReward.toFixed(1)}x R:R
              </p>
            </div>
            <div className="rounded-lg border border-bull/20 bg-bull/5 p-3 col-span-2 lg:col-span-1">
              <div className="flex items-center gap-1.5 text-bull/70">
                <Target className="h-3.5 w-3.5" />
                <p className="text-[10px] uppercase tracking-widest font-semibold">Target 3</p>
              </div>
              <p className="tabular mt-1 text-base font-bold text-foreground">
                {result.target3 ? `$${fmtPrice(result.target3)}` : "N/A"}
              </p>
              <p className="tabular mt-0.5 text-[9px] text-muted-foreground">
                Macro resistance
              </p>
            </div>
          </section>

          <TradeCalculator
            entry={result.entry}
            stopLoss={result.stopLoss}
            target1={result.target1}
            target2={result.target2}
            target3={result.target3}
            direction={isLong ? "LONG" : "SHORT"}
            balance={calcBalance}
            setBalance={setCalcBalance}
            riskPct={calcRiskPct}
            setRiskPct={setCalcRiskPct}
            isTracked={isTracked}
            onTrack={handleTrack}
          />
        </div>
      )}

      <PriceChart
        candles={result.candles}
        levels={
          isNoTrade
            ? []
            : [
                { label: "E", value: result.entry, color: "var(--primary)" },
                { label: "SL", value: result.stopLoss, color: "var(--bear)" },
                { label: "T1", value: result.target1, color: "var(--bull)" },
                { label: "T2", value: result.target2, color: "var(--bull)" },
                ...(result.target3 ? [{ label: "T3", value: result.target3, color: "var(--bull)" }] : [])
              ]
        }
      />

      <ExchangeStatus
        attempts={result.dataSource.attempts}
        candleSource={result.dataSource.candles}
        tickerSource={result.dataSource.ticker}
      />

      <section className="rounded-xl border border-border bg-card/50 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Confluence Evidence Breakdown
        </h3>
        <ul className="mt-3 space-y-3">
          {result.reasoning.map((r) => (
            <li key={r.label} className="border-l-2 border-primary/50 pl-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
                {r.label}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-foreground/90">{r.detail}</p>
            </li>
          ))}
        </ul>
        {result.invalidation ? (
          <div className="mt-4 rounded-lg border border-bear/30 bg-bear/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-bear">
              Structural Invalidation Line
            </p>
            <p className="mt-1 text-sm text-foreground/90">{result.invalidation}</p>
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Indicator readings
        </h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="RSI (14)"
            value={result.indicators.rsi.toFixed(1)}
            hint={
              result.indicators.rsi > 70
                ? "overbought"
                : result.indicators.rsi < 30
                  ? "oversold"
                  : "neutral zone"
            }
          />
          <Stat
            label="MACD hist"
            value={result.indicators.macdHistogram.toFixed(4)}
            hint={result.indicators.macdHistogram >= 0 ? "bullish cross" : "bearish cross"}
          />
          <Stat label="Trend" value={result.indicators.trend} hint="EMA 20/50/200 stack" />
          <Stat
            label="Volume"
            value={result.indicators.volumeLabel}
            hint={`${result.indicators.volumeRatio}x baseline`}
          />
          <Stat label="EMA 20" value={`$${fmtPrice(result.indicators.ema20)}`} />
          <Stat label="EMA 50" value={`$${fmtPrice(result.indicators.ema50)}`} />
          <Stat label="EMA 200" value={`$${fmtPrice(result.indicators.ema200)}`} />
          <Stat
            label="ATR (14)"
            value={`$${fmtPrice(result.indicators.atr)}`}
            hint={`${result.indicators.atrPct}% of price`}
          />
          <Stat label="Swing high" value={`$${fmtPrice(result.indicators.swingHigh)}`} />
          <Stat label="Swing low" value={`$${fmtPrice(result.indicators.swingLow)}`} />
          <Stat label="24h high" value={`$${fmtPrice(result.high24h)}`} />
          <Stat label="24h low" value={`$${fmtPrice(result.low24h)}`} />
        </div>
      </section>

      <p className="tabular text-[10px] text-muted-foreground">
        Generated {new Date(result.generatedAt).toUTCString()} · indicators computed from live exchange candles
      </p>
    </div>
  );
}
