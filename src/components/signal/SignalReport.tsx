import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, MinusCircle, Target, ShieldAlert, Crosshair, Share2, Calculator, Play } from "lucide-react";
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
  direction,
  balance,
  setBalance,
  leverage,
  setLeverage,
  isTracked,
  onTrack,
}: {
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  direction: "LONG" | "SHORT";
  balance: number;
  setBalance: (v: number) => void;
  leverage: number;
  setLeverage: (v: number) => void;
  isTracked: boolean;
  onTrack: () => void;
}) {

  const priceRiskPct = (Math.abs(entry - stopLoss) / entry) * 100;
  
  // Position size is directly based on leverage selection
  const positionSize = balance * leverage;

  // Contracts (e.g. BTC size)
  const contractSize = entry > 0 ? positionSize / entry : 0;

  // Risk size is calculated from stop loss distance
  const riskAmount = positionSize * (priceRiskPct / 100);
  const riskPct = balance > 0 ? (riskAmount / balance) * 100 : 0;

  // Estimated profit amounts
  const t1ProfitPct = (Math.abs(target1 - entry) / entry) * 100;
  const t2ProfitPct = (Math.abs(target2 - entry) / entry) * 100;

  const estProfitT1 = positionSize * (t1ProfitPct / 100);
  const estProfitT2 = positionSize * (t2ProfitPct / 100);

  // Liquidation check (if leverage * price change is >= 90%)
  const isLiquidation = leverage * (priceRiskPct / 100) >= 0.9;

  return (
    <div className="rounded-xl border border-border bg-card/45 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5 text-primary" /> Sizing & Leverage Calculator
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
            <span>Selected Leverage</span>
            <span className="text-primary font-bold text-sm">{leverage}x</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={leverage}
                onChange={(e) => setLeverage(parseInt(e.target.value) || 1)}
                className="flex-1 accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer"
              />
            </div>
            {/* Presets Grid */}
            <div className="grid grid-cols-6 gap-1">
              {[1, 2, 5, 10, 25, 50].map((lev) => (
                <button
                  key={lev}
                  type="button"
                  onClick={() => setLeverage(lev)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[9px] font-bold transition-colors text-center",
                    leverage === lev
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  )}
                >
                  {lev}x
                </button>
              ))}
              <button
                type="button"
                onClick={() => setLeverage(100)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[9px] font-bold transition-colors text-center border-red-500/30 text-red-400 hover:bg-red-500/10",
                  leverage === 100 && "bg-red-500/20 text-red-300 border-red-500/60"
                )}
              >
                100x
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLiquidation && (
        <div className="rounded border border-red-500/40 bg-red-500/5 px-3 py-2 flex items-center gap-2 text-red-400 text-xs">
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-500 animate-pulse" />
          <span className="font-semibold">
            Liquidation Risk: Stop Loss ({priceRiskPct.toFixed(2)}%) exceeds liquidation threshold at {leverage}x leverage!
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
            {contractSize.toFixed(4)} Units
          </span>
        </div>

        <div className="p-2 rounded bg-muted/10 border border-border/30">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
            Est. Loss (SL)
          </span>
          <span className={cn(
            "tabular text-sm font-bold block mt-0.5 text-bear",
            riskPct > 35 && "animate-pulse"
          )}>
            -${riskAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[9px] text-muted-foreground block mt-0.5">
            {riskPct.toFixed(1)}% of Account
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
          <span className="text-[9px] uppercase tracking-wider text-bull block">
            Profit Target 2
          </span>
          <span className="tabular text-sm font-bold text-bull block mt-0.5">
            +${estProfitT2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="tabular text-[9px] text-muted-foreground block mt-0.5">
            {t2ProfitPct.toFixed(1)}% move
          </span>
        </div>
      </div>

      <div className="pt-2.5 border-t border-border/40">
        <Button
          variant={isTracked ? "secondary" : "default"}
          size="sm"
          disabled={isTracked}
          onClick={onTrack}
          className={cn(
            "w-full h-8.5 gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
            isTracked
              ? "bg-muted/30 border border-border text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          <Play className="h-3.5 w-3.5" /> {isTracked ? "Position is being tracked" : "Track Live Position Now"}
        </Button>
      </div>
    </div>
  );
}

export function SignalReport({ result }: { result: SignalResult }) {
  const isLong = result.direction === "LONG";
  const isShort = result.direction === "SHORT";
  const dirColor = isLong ? "text-bull" : isShort ? "text-bear" : "text-neutral";
  const DirIcon = isLong ? ArrowUpRight : isShort ? ArrowDownRight : MinusCircle;

  const { trades, trackTrade } = useTradeTracker();
  const [calcBalance, setCalcBalance] = useState<number>(1000);
  const [calcLeverage, setCalcLeverage] = useState<number>(5);

  const isTracked = trades.some(
    (t) =>
      t.symbol === result.symbol &&
      t.timeframe === result.timeframe &&
      (t.status === "PENDING" || t.status === "ACTIVE" || t.status === "TP1_HIT")
  );

  const handleTrack = () => {
    if (result.direction === "NO TRADE") return;
    trackTrade({
      symbol: result.symbol,
      timeframe: result.timeframe,
      direction: result.direction,
      entry: result.entry,
      stopLoss: result.stopLoss,
      target1: result.target1,
      target2: result.target2,
      leverage: calcLeverage,
      balance: calcBalance,
    });
  };

  const getChartImageBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      try {
        const svgEl = document.getElementById("price-chart-svg");
        if (!svgEl) {
          resolve(null);
          return;
        }

        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(svgEl);

        // Standardize namespace
        if (!source.match(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)) {
          source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        // Inline CSS theme variables so they render in the isolated Image context
        const rootStyles = getComputedStyle(document.documentElement);
        const variables = [
          "--background",
          "--foreground",
          "--card",
          "--primary",
          "--neutral",
          "--bull",
          "--bear",
          "--grid",
          "--border",
          "--muted-foreground",
        ];

        variables.forEach((v) => {
          const color = rootStyles.getPropertyValue(v).trim();
          const regex = new RegExp(`var\\(${v}\\)`, "g");
          source = source.replace(regex, color);
        });

        // Add explicit style definitions inside the SVG source for fonts
        const fontStyle = `
          <style>
            svg {
              font-family: system-ui, -apple-system, sans-serif;
            }
            .text-muted-foreground {
              color: rgb(156, 163, 175);
              fill: rgb(156, 163, 175);
            }
          </style>
        `;
        source = source.replace(/<\/defs>/, `${fontStyle}</defs>`);

        // Convert XML string to Blob and load it into a temporary Image object
        const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            // Set canvas size matching the original SVG aspect ratio (760x390)
            canvas.width = 760;
            canvas.height = 390;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              // Fill background color matching document root theme
              const bgVal = rootStyles.getPropertyValue("--card").trim() || "#151821";
              ctx.fillStyle = bgVal.includes("oklch") ? "#151821" : bgVal;
              ctx.fillRect(0, 0, 760, 390);

              ctx.drawImage(img, 0, 0, 760, 390);
              canvas.toBlob((pngBlob) => {
                URL.revokeObjectURL(url);
                resolve(pngBlob);
              }, "image/png");
            } else {
              URL.revokeObjectURL(url);
              resolve(null);
            }
          } catch (err) {
            console.error("[share] Canvas draw error:", err);
            URL.revokeObjectURL(url);
            resolve(null);
          }
        };
        img.onerror = (e) => {
          console.error("[share] Image loading error:", e);
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      } catch (err) {
        console.error("[share] SVG processing error:", err);
        resolve(null);
      }
    });
  };

  const handleShare = async () => {
    const isLongSetup = result.direction === "LONG";
    const emoji = isLongSetup ? "📈" : result.direction === "SHORT" ? "📉" : "⚪";
    const percentage = result.change24hPct >= 0 ? `+${result.change24hPct.toFixed(2)}%` : `${result.change24hPct.toFixed(2)}%`;
    const riskPct = ((Math.abs(result.entry - result.stopLoss) / result.entry) * 100).toFixed(2);
    const target1Pct = ((Math.abs(result.target1 - result.entry) / result.entry) * 100).toFixed(2);
    const sentimentStr = result.sentiment ? `${result.sentiment.value} (${result.sentiment.label})` : "N/A";

    const reasoningText = result.reasoning
      .map((r) => `• [${r.label}] ${r.detail}`)
      .join("\n");

    const isNoTrade = result.direction === "NO TRADE";
    const text = isNoTrade
      ? `⚪ CRYPTO COMPASS SIGNAL: ${result.symbol}/USDT (${result.timeframe.toUpperCase()})

Direction: NO ACTIVE TRADE SETUP (Capital Preservation)
Current Price: $${fmtPrice(result.currentPrice)} (${percentage} 24h)
Market Regime: ${result.marketRegime}
Retail Sentiment: ${sentimentStr}

💡 Why This Trend:
${reasoningText}

Summary: ${result.summary}

Generated via Crypto Compass Lab.`
      : `${emoji} CRYPTO COMPASS SIGNAL: ${result.symbol}/USDT (${result.timeframe.toUpperCase()})

Direction: ${result.direction} (Confidence: ${result.confidence}%)
Current Price: $${fmtPrice(result.currentPrice)} (${percentage} 24h)
Market Regime: ${result.marketRegime}
Retail Sentiment: ${sentimentStr}

🎯 Entry Zone: $${fmtPrice(result.entry)}
🛡️ Stop Loss: $${fmtPrice(result.stopLoss)} (Risk: ${riskPct}%)
🥇 Target 1: $${fmtPrice(result.target1)} (Reward: ${target1Pct}%)
🥈 Target 2: $${fmtPrice(result.target2)}
⚖️ Risk/Reward: ${result.riskReward.toFixed(2)}R

💡 Why This Trend:
${reasoningText}

Summary: ${result.summary}
Invalidation: ${result.invalidation}

Generated via Crypto Compass Lab.`;

    const hasShare = typeof navigator !== "undefined" && !!navigator.share;
    const hasClipboard = typeof navigator !== "undefined" && !!navigator.clipboard;

    // Fallback: Show prompt to let user copy text manually
    const fallbackCopyManual = () => {
      try {
        window.prompt(
          "HTTP Connection: Direct sharing & clipboard copies are blocked by mobile browser security. Copy the trade setup below manually:",
          text
        );
      } catch (e) {
        console.error(e);
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
          toast.success("Signal card and chart shared successfully!");
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            return;
          }
        }
      }

      // Fallback: Copy both text and image to clipboard if ClipboardItem is available
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

    // Fallbacks if PNG conversion failed or clipboard writing is restricted
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
              Confidence {result.confidence}% · R:R {result.riskReward.toFixed(2)} ·{" "}
              {result.modelUsed}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  result.marketRegime.includes("Bullish")
                    ? "border-bull/30 bg-bull/10 text-bull"
                    : result.marketRegime.includes("Bearish")
                      ? "border-bear/30 bg-bear/10 text-bear"
                      : "border-border bg-muted/20 text-muted-foreground",
                )}
              >
                {result.marketRegime}
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

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", isLong ? "bg-bull" : isShort ? "bg-bear" : "bg-neutral")}
            style={{ width: `${result.confidence}%` }}
          />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-foreground/90">{result.summary}</p>
      </section>

      {result.direction === "NO TRADE" ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card/45 p-6 text-center">
          <ShieldAlert className="h-7 w-7 text-muted-foreground/80" />
          <h4 className="text-sm font-semibold text-foreground">No Trade Setup Available</h4>
          <p className="text-xs text-muted-foreground max-w-sm">
            Current market structure does not offer a high-probability confluence sweet spot. Capital preservation is prioritized over low-probability entries.
          </p>
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center gap-1.5 text-primary">
              <Crosshair className="h-3.5 w-3.5" />
              <p className="text-[10px] uppercase tracking-widest">Entry</p>
            </div>
            <p className="tabular mt-1 text-lg font-semibold text-foreground">
              ${fmtPrice(result.entry)}
            </p>
          </div>
          <div className="rounded-lg border border-bear/40 bg-bear/5 p-3">
            <div className="flex items-center gap-1.5 text-bear">
              <ShieldAlert className="h-3.5 w-3.5" />
              <p className="text-[10px] uppercase tracking-widest">Stop loss</p>
            </div>
            <p className="tabular mt-1 text-lg font-semibold text-foreground">
              ${fmtPrice(result.stopLoss)}
            </p>
            <p className="tabular mt-0.5 text-[10px] text-muted-foreground">
              risk {fmtPct((Math.abs(result.entry - result.stopLoss) / result.entry) * 100)}
            </p>
          </div>
          <div className="rounded-lg border border-bull/40 bg-bull/5 p-3">
            <div className="flex items-center gap-1.5 text-bull">
              <Target className="h-3.5 w-3.5" />
              <p className="text-[10px] uppercase tracking-widest">Target 1</p>
            </div>
            <p className="tabular mt-1 text-lg font-semibold text-foreground">
              ${fmtPrice(result.target1)}
            </p>
            <p className="tabular mt-0.5 text-[10px] text-muted-foreground">
              reward {fmtPct((Math.abs(result.target1 - result.entry) / result.entry) * 100)}
            </p>
          </div>
          <div className="rounded-lg border border-bull/25 bg-bull/5 p-3">
            <div className="flex items-center gap-1.5 text-bull/80">
              <Target className="h-3.5 w-3.5" />
              <p className="text-[10px] uppercase tracking-widest">Target 2</p>
            </div>
            <p className="tabular mt-1 text-lg font-semibold text-foreground">
              ${fmtPrice(result.target2)}
            </p>
          </div>
        </section>
      )}

      {result.direction !== "NO TRADE" && (
        <TradeCalculator
          entry={result.entry}
          stopLoss={result.stopLoss}
          target1={result.target1}
          target2={result.target2}
          direction={isLong ? "LONG" : "SHORT"}
          balance={calcBalance}
          setBalance={setCalcBalance}
          leverage={calcLeverage}
          setLeverage={setCalcLeverage}
          isTracked={isTracked}
          onTrack={handleTrack}
        />
      )}

      <PriceChart
        candles={result.candles}
        levels={
          result.direction === "NO TRADE"
            ? []
            : [
                { label: "E", value: result.entry, color: "var(--primary)" },
                { label: "SL", value: result.stopLoss, color: "var(--bear)" },
                { label: "T1", value: result.target1, color: "var(--bull)" },
                { label: "T2", value: result.target2, color: "var(--bull)" },
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
          Why this signal
        </h3>
        <ul className="mt-3 space-y-3">
          {result.reasoning.map((r) => (
            <li key={r.label} className="border-l-2 border-primary/50 pl-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {r.label}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-foreground/90">{r.detail}</p>
            </li>
          ))}
        </ul>
        {result.invalidation ? (
          <div className="mt-4 rounded-lg border border-bear/30 bg-bear/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-bear">
              Invalidation
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
        Generated {new Date(result.generatedAt).toLocaleString()} · indicators computed from live
        exchange candles
      </p>
    </div>
  );
}
