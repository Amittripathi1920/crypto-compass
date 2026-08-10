import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, History, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COINS, TIMEFRAMES, type Timeframe } from "@/lib/coins";
import { backtestCoin } from "@/lib/backtest.functions";
import { ExchangeStatus } from "@/components/signal/ExchangeStatus";
import { EquityCurve } from "@/components/signal/EquityCurve";
import { fmtPrice } from "@/components/signal/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "Strategy Backtest — Win Rate & Average R:R | Crypto Signal Lab" },
      {
        name: "description",
        content:
          "Replay the long/short/no-trade rules over historical candles for any timeframe and see win rate, average R:R, expectancy and every simulated trade.",
      },
      { property: "og:title", content: "Strategy Backtest — Win Rate & Average R:R" },
      {
        property: "og:description",
        content:
          "Historical walk-forward test of the signal rules with win rate, average R multiple, profit factor and trade-by-trade results.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BacktestPage,
});

const STOPS = [1, 1.5, 2, 2.5];
const TARGETS = [1.5, 2, 2.5, 3];
const HOLDS = [10, 20, 30, 50];

function BacktestPage() {
  const [symbol, setSymbol] = useState("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("4h");
  const [stopAtr, setStopAtr] = useState(1.5);
  const [target1Rr, setTarget1Rr] = useState(2);
  const [maxBarsHeld, setMaxBarsHeld] = useState(30);

  const run = useServerFn(backtestCoin);
  const mutation = useMutation({
    mutationFn: () => run({ data: { symbol, timeframe, stopAtr, target1Rr, maxBarsHeld } }),
  });

  const result = mutation.data;
  const errorMessage =
    mutation.error instanceof Error
      ? mutation.error.message
      : mutation.error
        ? "Backtest failed."
        : "";
  const [errorHeadline, ...errorDetails] = errorMessage.split("\n");

  const rangeLabel = useMemo(() => {
    if (!result) return "";
    const f = new Date(result.range.from).toLocaleDateString();
    const t = new Date(result.range.to).toLocaleDateString();
    return `${f} → ${t}`;
  }, [result]);

  return (
    <main className="min-h-screen bg-background">
      <div className="terminal-grid border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="flex items-center gap-2 text-primary">
            <History className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">
              Strategy backtest
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            How the rules would have performed.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The same LONG / SHORT / NO TRADE rule set is replayed bar by bar over historical candles
            — only data available up to each bar is used. Stops and targets are ATR-anchored, and if
            both trade inside one candle the stop is assumed first.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to live signals
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <section className="rounded-xl border border-border bg-card/60 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Coin
              </Label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COINS.map((c) => (
                    <SelectItem key={c.symbol} value={c.symbol}>
                      {c.symbol} · {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Timeframe
              </Label>
              <div className="flex gap-2">
                {TIMEFRAMES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTimeframe(t.value)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-2 text-xs font-semibold transition-colors",
                      timeframe === t.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <ChipRow
              label="Stop (× ATR)"
              options={STOPS}
              value={stopAtr}
              onChange={setStopAtr}
              format={(v) => `${v}×`}
            />
            <ChipRow
              label="Target (R)"
              options={TARGETS}
              value={target1Rr}
              onChange={setTarget1Rr}
              format={(v) => `${v}R`}
            />
            <ChipRow
              label="Max bars held"
              options={HOLDS}
              value={maxBarsHeld}
              onChange={setMaxBarsHeld}
              format={(v) => String(v)}
            />
          </div>

          <Button
            className="mt-5 w-full font-semibold"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Replaying candles…
              </>
            ) : (
              <>Run backtest</>
            )}
          </Button>
        </section>

        {errorMessage ? (
          <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-5">
            <div className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="h-4 w-4" />
              <span className="text-sm font-semibold">{errorHeadline}</span>
            </div>
            {errorDetails.length > 0 ? (
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                {errorDetails.join("\n")}
              </pre>
            ) : null}
          </section>
        ) : null}

        {result ? (
          <>
            <section className="rounded-xl border border-border bg-card/60 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {result.symbol}/USDT · {result.timeframe} · {result.stats.trades} trades
                </h2>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {rangeLabel} · {result.range.candles} candles ({result.stats.warmupBars} warm-up)
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label="Win rate"
                  value={`${result.stats.winRate}%`}
                  tone={result.stats.winRate >= 50 ? "up" : "down"}
                  hint={`${result.stats.wins}W / ${result.stats.losses}L`}
                />
                <Stat
                  label="Average R:R"
                  value={`${result.stats.avgRR > 0 ? "+" : ""}${result.stats.avgRR}R`}
                  tone={result.stats.avgRR >= 0 ? "up" : "down"}
                  hint="per trade, realised"
                />
                <Stat
                  label="Profit factor"
                  value={String(result.stats.profitFactor)}
                  tone={result.stats.profitFactor >= 1 ? "up" : "down"}
                  hint={`total ${result.stats.totalR > 0 ? "+" : ""}${result.stats.totalR}R`}
                />
                <Stat
                  label="Max drawdown"
                  value={`-${result.stats.maxDrawdownR}R`}
                  tone="down"
                  hint={`avg hold ${result.stats.avgBarsHeld} bars`}
                />
                <Stat
                  label="Avg win"
                  value={`+${result.stats.avgWinR}R`}
                  tone="up"
                  hint={`long ${result.stats.longWinRate}% win`}
                />
                <Stat
                  label="Avg loss"
                  value={`${result.stats.avgLossR}R`}
                  tone="down"
                  hint={`short ${result.stats.shortWinRate}% win`}
                />
                <Stat
                  label="Signal mix"
                  value={`${result.stats.signals.long}L / ${result.stats.signals.short}S`}
                  hint={`${result.stats.signals.noTrade} no-trade bars`}
                />
                <Stat
                  label="Buy & hold"
                  value={`${result.stats.buyHoldPct > 0 ? "+" : ""}${result.stats.buyHoldPct}%`}
                  tone={result.stats.buyHoldPct >= 0 ? "up" : "down"}
                  hint="same window, for reference"
                />
              </div>
            </section>

            {result.stats.equityCurve.length > 1 ? (
              <section className="rounded-xl border border-border bg-card/60 p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  Cumulative R over the test window
                </h2>
                <EquityCurve points={result.stats.equityCurve} className="mt-4" />
              </section>
            ) : null}

            <section className="rounded-xl border border-border bg-card/60 p-5">
              <h2 className="text-sm font-semibold text-foreground">Trade log</h2>
              {result.trades.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  The rules never produced a qualifying setup in this window. Try a longer timeframe
                  or a wider stop.
                </p>
              ) : (
                <div className="mt-3 max-h-[26rem] overflow-auto">
                  <table className="w-full min-w-[46rem] text-left font-mono text-[11px]">
                    <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Opened</th>
                        <th className="py-2 pr-3 font-medium">Side</th>
                        <th className="py-2 pr-3 font-medium">Entry</th>
                        <th className="py-2 pr-3 font-medium">Stop</th>
                        <th className="py-2 pr-3 font-medium">Target</th>
                        <th className="py-2 pr-3 font-medium">Exit</th>
                        <th className="py-2 pr-3 font-medium">Bars</th>
                        <th className="py-2 pr-3 font-medium">Result</th>
                        <th className="py-2 pr-3 text-right font-medium">R</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t) => (
                        <tr key={`${t.index}-${t.time}`} className="border-t border-border/60">
                          <td className="py-1.5 pr-3 text-muted-foreground">
                            {new Date(t.time).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td
                            className={cn(
                              "py-1.5 pr-3 font-semibold",
                              t.direction === "LONG" ? "text-primary" : "text-destructive",
                            )}
                          >
                            {t.direction}
                          </td>
                          <td className="py-1.5 pr-3">{fmtPrice(t.entry)}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">
                            {fmtPrice(t.stopLoss)}
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground">
                            {fmtPrice(t.target1)}
                          </td>
                          <td className="py-1.5 pr-3">{fmtPrice(t.exit)}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{t.barsHeld}</td>
                          <td className="py-1.5 pr-3 uppercase text-muted-foreground">
                            {t.outcome}
                          </td>
                          <td
                            className={cn(
                              "py-1.5 pr-3 text-right font-semibold",
                              t.r >= 0 ? "text-primary" : "text-destructive",
                            )}
                          >
                            {t.r > 0 ? "+" : ""}
                            {t.r}R
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <ExchangeStatus
              attempts={result.dataSource.attempts}
              candleSource={result.dataSource.candles}
            />

            <p className="pb-6 text-[11px] leading-relaxed text-muted-foreground">
              Past performance on a few hundred candles is not predictive. Results exclude fees,
              funding and slippage, assume one position at a time, and fills happen at the next
              candle's open. Not financial advice.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}

function ChipRow({
  label,
  options,
  value,
  onChange,
  format,
}: {
  label: string;
  options: number[];
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              "flex-1 rounded-md border px-2 py-1.5 font-mono text-[11px] transition-colors",
              value === o
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-xl font-semibold",
          tone === "up" ? "text-primary" : tone === "down" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
