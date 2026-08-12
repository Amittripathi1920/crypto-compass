import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Activity, KeyRound, Loader2, Sparkles, TriangleAlert, Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { COINS, PROVIDERS, TIMEFRAMES, providerById, type ProviderId, type Timeframe } from "@/lib/coins";
import { analyzeCoin, getPatternAnalysis } from "@/lib/signal.functions";
import { PatternDashboard } from "@/components/signal/PatternDashboard";
import { SignalReport } from "@/components/signal/SignalReport";
import { TradeTrackerCard } from "@/components/tracker/TradeTrackerCard";
import { ExchangeStatus } from "@/components/signal/ExchangeStatus";
import { useSession } from "@/lib/auth-client";
import { UserNav } from "@/components/auth/UserNav";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { TradeTrackerProvider } from "@/hooks/useTradeTracker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Crypto Signal Lab — AI Long/Short Analysis with Entry & Stop" },
      {
        name: "description",
        content:
          "Get an AI long or short signal for top cryptocurrencies with entry price, stop loss, targets and full technical reasoning from live market data.",
      },
      { property: "og:title", content: "Crypto Signal Lab — AI Long/Short Analysis" },
      {
        property: "og:description",
        content:
          "Live RSI, MACD, EMA and ATR readings turned into a long or short call with entry, stop loss and target prices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

if (typeof window !== "undefined") {
  (window as any).__errors = (window as any).__errors || [];
  window.onerror = function (message, source, lineno, colno, error) {
    (window as any).__errors.push({ type: 'onerror', message, source, lineno, colno, error: error?.stack });
  };
  const prevError = console.error;
  console.error = function (...args) {
    (window as any).__errors.push({ type: 'console.error', args: args.map(a => a instanceof Error ? a.stack : String(a)) });
    prevError.apply(console, args);
  };
}

function Index() {
  const { data: sessionData } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [browserErrors, setBrowserErrors] = useState<any[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const interval = setInterval(() => {
      const errs = (window as any).__errors || [];
      if (errs.length !== browserErrors.length) {
        setBrowserErrors([...errs]);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [browserErrors]);

  const [symbol, setSymbol] = useState<string>("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("4h");
  const [provider, setProvider] = useState<ProviderId>("groq");
  const [model, setModel] = useState<string>("llama-3.3-70b-versatile");
  const [apiKey, setApiKey] = useState<string>("");
  const [minScore, setMinScore] = useState(60);
  const [minRR, setMinRR] = useState(1.5);
  const [atrMult, setAtrMult] = useState(1.5);
  const [pivotStr, setPivotStr] = useState(4);

  useEffect(() => {
    try {
      const savedProvider = localStorage.getItem("cc_prev_provider");
      if (savedProvider) {
        setProvider(savedProvider as ProviderId);
        // Load the correct saved model for this provider if it exists
        const savedModel = localStorage.getItem("cc_prev_model");
        if (savedModel) {
          setModel(savedModel);
        } else {
          setModel(providerById(savedProvider as ProviderId).defaultModel);
        }
      }
      const savedApiKey = localStorage.getItem("cc_prev_api_key");
      if (savedApiKey) {
        setApiKey(savedApiKey);
      }
    } catch (e) {
      // Ignore localStorage errors in sandboxes/private browsing
    }
  }, []);
  const [lastSuccess, setLastSuccess] = useState<
    { at: string; symbol: string; timeframe: Timeframe; source: string } | null
  >(null);

  const activeProvider = useMemo(() => providerById(provider), [provider]);
  const analyze = useServerFn(analyzeCoin);
  const fetchPatterns = useServerFn(getPatternAnalysis);

  const mutation = useMutation({
    mutationFn: () =>
      analyze({
        data: {
          symbol,
          timeframe,
          provider,
          model: model || undefined,
          apiKey: activeProvider.needsKey ? apiKey.trim() : undefined,
          config: {
            minimumScore: minScore,
            minimumSetupScore: minScore,
            minimumEntryScore: minScore,
            minimumRR: minRR,
            atrMultiplier: atrMult,
            pivotStrength: pivotStr,
          }
        },
      }),
  });

  const patternMutation = useMutation({
    mutationFn: () =>
      fetchPatterns({
        data: {
          symbol,
          timeframe,
        },
      }),
  });

  const keyMissing = false;
  const errorMessage =
    mutation.error instanceof Error ? mutation.error.message : mutation.error ? "Analysis failed." : "";
  const [errorHeadline, ...errorDetails] = errorMessage.split("\n");

  useEffect(() => {
    if (mutation.data) {
      setLastSuccess({
        at: mutation.data.generatedAt,
        symbol: mutation.data.symbol,
        timeframe: mutation.data.timeframe,
        source: mutation.data.dataSource.candles,
      });
    }
  }, [mutation.data]);

  return (
    <TradeTrackerProvider>
      <main className="min-h-screen bg-background">
        <div className="terminal-grid border-b border-border">
          <div className="mx-auto max-w-5xl px-4 py-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Activity className="h-4 w-4" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">
                  Crypto Compass Lab
                </span>
              </div>
              {/* User Session Profile Controls */}
              <div className="flex items-center gap-4">
                <Link
                  to="/backtest"
                  className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  Backtesting
                </Link>
                {sessionData?.user ? (
                  <UserNav />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAuthOpen(true)}
                    className="h-7 px-3 text-[10px] font-semibold uppercase tracking-wider border border-border bg-background/50 hover:bg-accent text-muted-foreground hover:text-foreground"
                  >
                    Sign In
                  </Button>
                )}
              </div>
            </div>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              Long or short — with the reasoning, entry, stop and targets.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Indicators are computed in code from live exchange candles, then an AI model turns them
              into a directional call with concrete trade levels. Nothing is stored — every run is
              fresh.
            </p>

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
                        "tabular flex-1 rounded-md border px-3 py-2 text-xs transition-colors",
                        timeframe === t.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {TIMEFRAMES.find((t) => t.value === timeframe)?.horizon}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  AI provider
                </Label>
                <Select
                  value={provider}
                  onValueChange={(v) => {
                    const next = v as ProviderId;
                    setProvider(next);
                    const nextModel = providerById(next).defaultModel;
                    setModel(nextModel);
                    try {
                      localStorage.setItem("cc_prev_provider", next);
                      localStorage.setItem("cc_prev_model", nextModel);
                    } catch (e) { }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Model
                </Label>
                <Select
                  value={model}
                  onValueChange={(v) => {
                    setModel(v);
                    try {
                      localStorage.setItem("cc_prev_model", v);
                    } catch (e) { }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProvider.models.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {activeProvider.needsKey ? (
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <KeyRound className="h-3 w-3" /> {activeProvider.label} API key
                  </Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setApiKey(val);
                      try {
                        localStorage.setItem("cc_prev_api_key", val);
                      } catch (e) { }
                    }}
                    placeholder={activeProvider.keyHint}
                    autoComplete="off"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    🔒 Secret Key Stored Locally and never shared with server.
                  </p>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground md:col-span-2">
                  {activeProvider.keyHint}
                </p>
              )}
            </div>

            {/* Collapsible Strategy Settings */}
            <div className="mt-3.5 pt-3.5 border-t border-border/30">
              <details className="group cursor-pointer select-none">
                <summary className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <span>🛠️ Strategy Engine Parameters</span>
                  <span className="text-[8px] opacity-75 font-normal tracking-normal group-open:hidden">(Click to Expand)</span>
                  <span className="text-[8px] opacity-75 font-normal tracking-normal hidden group-open:inline">(Click to Collapse)</span>
                </summary>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 pt-3.5 pl-1.5 cursor-default" onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-wider text-muted-foreground">
                      <span>Min Confluence</span>
                      <span className="text-foreground font-bold font-mono">{minScore}</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="90"
                      step="5"
                      value={minScore}
                      onChange={(e) => setMinScore(parseInt(e.target.value))}
                      className="w-full accent-primary h-1 rounded-full bg-muted cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-wider text-muted-foreground">
                      <span>Min Risk/Reward</span>
                      <span className="text-foreground font-bold font-mono">{minRR.toFixed(1)}R</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="3.0"
                      step="0.1"
                      value={minRR}
                      onChange={(e) => setMinRR(parseFloat(e.target.value))}
                      className="w-full accent-primary h-1 rounded-full bg-muted cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-wider text-muted-foreground">
                      <span>ATR Stop Buffer</span>
                      <span className="text-foreground font-bold font-mono">{atrMult.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="2.5"
                      step="0.05"
                      value={atrMult}
                      onChange={(e) => setAtrMult(parseFloat(e.target.value))}
                      className="w-full accent-primary h-1 rounded-full bg-muted cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-wider text-muted-foreground">
                      <span>Pivot Bars</span>
                      <span className="text-foreground font-bold font-mono">{pivotStr} bars</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="8"
                      step="1"
                      value={pivotStr}
                      onChange={(e) => setPivotStr(parseInt(e.target.value))}
                      className="w-full accent-primary h-1 rounded-full bg-muted cursor-pointer"
                    />
                  </div>
                </div>
              </details>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3 w-full">
              <Button
                className="flex-grow"
                size="lg"
                disabled={mutation.isPending || keyMissing}
                onClick={() => {
                  patternMutation.reset();
                  mutation.mutate();
                }}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Setup...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Generate Trade Setup
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="flex-grow border-border bg-background/50 hover:bg-accent text-muted-foreground hover:text-foreground"
                size="lg"
                disabled={patternMutation.isPending}
                onClick={() => {
                  mutation.reset();
                  patternMutation.mutate();
                }}
              >
                {patternMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning Patterns...
                  </>
                ) : (
                  <>
                    <Compass className="mr-2 h-4 w-4" /> Pattern/Analysis
                  </>
                )}
              </Button>
            </div>
            {keyMissing ? (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Enter an API key, or switch back to the built-in Lovable AI.
              </p>
            ) : null}
          </section>

          {errorMessage ? (
            <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{errorHeadline}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {lastSuccess
                      ? `Last successful analysis: ${lastSuccess.symbol} · ${lastSuccess.timeframe} via ${lastSuccess.source} at ${new Date(lastSuccess.at).toLocaleString()}`
                      : "No successful analysis yet in this session."}
                  </p>
                </div>
              </div>

              {errorDetails.length > 0 ? (
                <div className="rounded-lg border border-border bg-background/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Market data attempts
                  </p>
                  <pre className="tabular mt-1.5 overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground/90">
                    {errorDetails.join("\n")}
                  </pre>
                </div>
              ) : null}

              <ExchangeStatus
                attempts={errorDetails.flatMap((linked) => {
                  const m = /^(OKX|Binance|Kraken) \((\d+)ms\): (.*)$/.exec(linked.trim());
                  return m ? [{ exchange: m[1]!, ok: false, ms: Number(m[2]), error: m[3]! }] : [];
                })}
              />
            </div>
          ) : null}

          {mutation.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-xl" />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : null}

          {mutation.data && !mutation.isPending ? <SignalReport result={mutation.data} /> : null}

          {patternMutation.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-xl" />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            </div>
          ) : null}

          {patternMutation.data && !patternMutation.isPending ? (
            <PatternDashboard
              patterns={patternMutation.data.patterns}
              candles={patternMutation.data.candles}
              symbol={symbol}
              timeframe={timeframe}
            />
          ) : null}

          <TradeTrackerCard />

          {browserErrors.length > 0 ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 mt-2 space-y-2">
              <h4 className="text-sm font-bold text-red-400">Captured Browser Error Logs ({browserErrors.length})</h4>
              <pre className="text-[10px] text-red-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto bg-black/40 p-2.5 rounded-lg border border-red-500/20">
                {JSON.stringify(browserErrors, null, 2)}
              </pre>
            </div>
          ) : null}

          <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />

          <p className="border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
            This tool is for research and education only and is not financial advice. Crypto markets
            are volatile and leveraged trading can lose more than your deposit. Always size positions
            to your own risk tolerance and verify levels on your own chart before trading.
          </p>
        </div>
      </main>
    </TradeTrackerProvider>
  );
}
