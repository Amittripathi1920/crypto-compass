import { ArrowDownRight, ArrowUpRight, MinusCircle, Target, ShieldAlert, Crosshair } from "lucide-react";
import type { SignalResult } from "@/lib/signal.server";
import { PriceChart } from "./PriceChart";
import { fmtPct, fmtPrice } from "./format";
import { cn } from "@/lib/utils";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-sm text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SignalReport({ result }: { result: SignalResult }) {
  const isLong = result.direction === "LONG";
  const isShort = result.direction === "SHORT";
  const dirColor = isLong ? "text-bull" : isShort ? "text-bear" : "text-neutral";
  const DirIcon = isLong ? ArrowUpRight : isShort ? ArrowDownRight : MinusCircle;

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
          </div>

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
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", isLong ? "bg-bull" : isShort ? "bg-bear" : "bg-neutral")}
            style={{ width: `${result.confidence}%` }}
          />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-foreground/90">{result.summary}</p>
      </section>

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

      <PriceChart
        candles={result.candles}
        levels={[
          { label: "E", value: result.entry, color: "var(--primary)" },
          { label: "SL", value: result.stopLoss, color: "var(--bear)" },
          { label: "T1", value: result.target1, color: "var(--bull)" },
          { label: "T2", value: result.target2, color: "var(--bull)" },
        ]}
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
