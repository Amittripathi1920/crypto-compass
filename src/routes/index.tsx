import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import {
  Activity,
  Compass,
  KeyRound,
  Loader2,
  Sparkles,
  TriangleAlert,
  Search,
  Zap,
  Flame,
  Layers,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import {
  COINS,
  PROVIDERS,
  TIMEFRAMES,
  providerById,
  type ProviderId,
  type Timeframe,
} from "@/lib/coins";
import type { ExchangeId } from "@/lib/market.server";
import { analyzeCoin, analyzeOteCoin, getPatternAnalysis } from "@/lib/signal.functions";
import { SignalReport } from "@/components/signal/SignalReport";
import { OteSignalReport } from "@/components/signal/OteSignalReport";
import { PatternDashboard } from "@/components/signal/PatternDashboard";
import { ExchangeStatus } from "@/components/signal/ExchangeStatus";
import { TradeTrackerCard } from "@/components/tracker/TradeTrackerCard";
import { TradeTrackerProvider } from "@/hooks/useTradeTracker";
import { useSession } from "@/lib/auth-client";
import { UserNav } from "@/components/auth/UserNav";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { fmtPrice } from "@/components/signal/format";
import { cn } from "@/lib/utils";
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
import type { SignalResult } from "@/lib/signal-types";
import type { OteSignal } from "@/lib/ote-engine/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Crypto Compass — Trade setups with reasoning, entry, stop and targets",
      },
      {
        name: "description",
        content:
          "Multi-timeframe confluence crypto trading engine. Indicators computed in code from live public exchange data, then synthesized into structured trade setups.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: sessionData } = useSession();
  const [authOpen, setAuthOpen] = useState(false);

  // Strategy Mode: "classic" (Engine v1) | "ote" (Institutional OTE v2)
  const [strategyTab, setStrategyTab] = useState<"classic" | "ote">("classic");

  const [symbol, setSymbol] = useState<string>("BTC");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filteredCoins = useMemo(() => {
    if (!symbol) return COINS;
    const s = symbol.toUpperCase().trim();
    return COINS.filter((c) => c.symbol.includes(s) || c.name.toUpperCase().includes(s));
  }, [symbol]);

  const [timeframe, setTimeframe] = useState<Timeframe>("4h");
  const [provider, setProvider] = useState<ProviderId>("groq");
  const [model, setModel] = useState<string>("llama-3.3-70b-versatile");
  const [apiKey, setApiKey] = useState<string>("");

  // Classic Strategy Parameters (Engine v1)
  const [minScore, setMinScore] = useState(60);
  const [minRR, setMinRR] = useState(1.5);
  const [atrMult, setAtrMult] = useState(1.5);
  const [pivotStr, setPivotStr] = useState(4);

  // Institutional OTE Parameters (Engine v2)
  const [oteMinRR, setOteMinRR] = useState(2.0);
  const [oteMinGrade, setOteMinGrade] = useState<"B" | "A" | "A+">("B");

  // Bulk scan states
  const [bulkScannedResults, setBulkScannedResults] = useState<
    Record<string, { ok: true; data: SignalResult } | { ok: false; error: string }>
  >({});
  const [oteBulkResults, setOteBulkResults] = useState<
    Record<string, { ok: true; data: OteSignal } | { ok: false; error: string }>
  >({});
  const [bulkScanning, setBulkScanning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentSymbol: "" });
  const [expandedSymbols, setExpandedSymbols] = useState<Record<string, boolean>>({});

  const activeProvider = useMemo(() => providerById(provider), [provider]);
  const analyze = useServerFn(analyzeCoin);
  const analyzeOte = useServerFn(analyzeOteCoin);
  const fetchPatterns = useServerFn(getPatternAnalysis);

  // Classic Scan All Coins
  const handleScanAll = async () => {
    setBulkScanning(true);
    setBulkScannedResults({});
    setExpandedSymbols({});
    setBulkProgress({ current: 0, total: COINS.length, currentSymbol: "" });

    const results: Record<string, { ok: true; data: SignalResult } | { ok: false; error: string }> =
      {};

    for (let i = 0; i < COINS.length; i++) {
      const coin = COINS[i]!;
      setBulkProgress({ current: i + 1, total: COINS.length, currentSymbol: coin.symbol });
      try {
        const res = await analyze({
          data: {
            symbol: coin.symbol,
            timeframe,
            provider,
            model,
            apiKey: activeProvider.needsKey ? apiKey.trim() : undefined,
            config: {
              minimumConfluenceScore: minScore,
              minimumRR: minRR,
              atrMultiplier: atrMult,
              pivotStrength: pivotStr,
            },
          },
        });
        results[coin.symbol] = { ok: true, data: res };
      } catch (err) {
        results[coin.symbol] = {
          ok: false,
          error: err instanceof Error ? err.message : "Scan failed",
        };
      }
      setBulkScannedResults({ ...results });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    setBulkScanning(false);
  };

  // OTE Scan All Coins
  const handleOteScanAll = async () => {
    setBulkScanning(true);
    setOteBulkResults({});
    setExpandedSymbols({});
    setBulkProgress({ current: 0, total: COINS.length, currentSymbol: "" });

    const results: Record<string, { ok: true; data: OteSignal } | { ok: false; error: string }> = {};

    for (let i = 0; i < COINS.length; i++) {
      const coin = COINS[i]!;
      setBulkProgress({ current: i + 1, total: COINS.length, currentSymbol: coin.symbol });
      try {
        const res = await analyzeOte({
          data: {
            symbol: coin.symbol,
            timeframe,
            provider,
            model,
            apiKey: activeProvider.needsKey ? apiKey.trim() : undefined,
            minRR: oteMinRR,
            minGrade: oteMinGrade,
          },
        });
        results[coin.symbol] = { ok: true, data: res };
      } catch (err) {
        results[coin.symbol] = {
          ok: false,
          error: err instanceof Error ? err.message : "Scan failed",
        };
      }
      setOteBulkResults({ ...results });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    setBulkScanning(false);
  };

  const handleProviderChange = (p: ProviderId) => {
    setProvider(p);
    const next = providerById(p);
    setModel(next.defaultModel);
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(`cc_api_key_${p}`);
        setApiKey(saved || "");
      }
    } catch {
      setApiKey("");
    }
  };

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(`cc_api_key_${provider}`);
        if (saved) setApiKey(saved);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const [lastSuccess, setLastSuccess] = useState<{
    at: string;
    symbol: string;
    timeframe: Timeframe;
    source: string;
  } | null>(null);

  // Classic Mutation
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
            minimumConfluenceScore: minScore,
            minimumRR: minRR,
            atrMultiplier: atrMult,
            pivotStrength: pivotStr,
          },
        },
      }),
  });

  // OTE Mutation
  const oteMutation = useMutation({
    mutationFn: () =>
      analyzeOte({
        data: {
          symbol,
          timeframe,
          provider,
          model: model || undefined,
          apiKey: activeProvider.needsKey ? apiKey.trim() : undefined,
          minRR: oteMinRR,
          minGrade: oteMinGrade,
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

  const keyMissing = activeProvider.needsKey && !apiKey.trim();
  const errorMessage =
    strategyTab === "classic"
      ? mutation.error instanceof Error
        ? mutation.error.message
        : mutation.error
          ? "Analysis failed."
          : ""
      : oteMutation.error instanceof Error
        ? oteMutation.error.message
        : oteMutation.error
          ? "OTE Analysis failed."
          : "";

  const [errorHeadline, ...errorDetails] = errorMessage.split("\n");

  useEffect(() => {
    if (mutation.data) {
      setLastSuccess({
        at: mutation.data.generatedAt,
        symbol: mutation.data.symbol,
        timeframe: mutation.data.timeframe,
        source: mutation.data.dataSource.exchange,
      });
    }
  }, [mutation.data]);

  return (
    <TradeTrackerProvider>
      <main className="min-h-screen bg-background">
        <div className="terminal-grid border-b border-border">
          <div className="mx-auto max-w-5xl px-4 py-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Activity className="h-4 w-4" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">
                  Crypto Compass Lab
                </span>
              </div>
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
              Professional Crypto Strategy & Execution Engines
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Run either the deterministic Confluence Engine v1 or the 4-Pillar Smart Money
              Institutional OTE Engine v2 across live multi-exchange liquidity data.
            </p>

            {/* Strategy Selection Tab Switcher */}
            <div className="mt-6 flex flex-wrap gap-2 border-t border-border/40 pt-4">
              <button
                type="button"
                onClick={() => setStrategyTab("classic")}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-all border",
                  strategyTab === "classic"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card/60 text-muted-foreground border-border hover:bg-accent hover:text-foreground",
                )}
              >
                <Sparkles className="h-4 w-4" />
                <span>Classic Confluence Engine (v1)</span>
              </button>

              <button
                type="button"
                onClick={() => setStrategyTab("ote")}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-all border",
                  strategyTab === "ote"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card/60 text-muted-foreground border-border hover:bg-accent hover:text-foreground",
                )}
              >
                <Flame className="h-4 w-4 text-amber-400" />
                <span>Institutional OTE Engine (v2 — New Strategy)</span>
                <span className="rounded bg-amber-400/20 px-1.5 py-0.2 text-[9px] font-black uppercase text-amber-300">
                  SMC
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
          {/* Main Controls Card */}
          <section className="rounded-xl border border-border bg-card/60 p-5 shadow-xs">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-1.5 md:col-span-2 relative">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Asset
                </Label>
                <div className="relative">
                  <Input
                    type="text"
                    value={symbol}
                    onChange={(e) => {
                      setSymbol(e.target.value.toUpperCase().trim());
                      setDropdownOpen(true);
                    }}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder="Search coin (e.g. BTC, ETH, SOL)..."
                    className="w-full bg-background/50 pr-8 uppercase"
                  />
                  <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>

                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                      {filteredCoins.length > 0 ? (
                        filteredCoins.map((c) => (
                          <button
                            key={c.symbol}
                            type="button"
                            className="w-full flex items-center justify-between px-3 py-2 text-xs rounded hover:bg-accent text-foreground text-left"
                            onClick={() => {
                              setSymbol(c.symbol);
                              setDropdownOpen(false);
                            }}
                          >
                            <span className="font-bold">{c.symbol}</span>
                            <span className="text-[10px] text-muted-foreground">{c.name}</span>
                          </button>
                        ))
                      ) : (
                        <div className="p-2 text-center text-[10px] text-muted-foreground">
                          Custom symbol "{symbol}" (must exist on Binance/OKX/Kraken)
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Primary Timeframe
                </Label>
                <Select value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
                  <SelectTrigger className="w-full bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEFRAMES.map((tf) => (
                      <SelectItem key={tf.value} value={tf.value}>
                        {tf.label} ({tf.horizon})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  AI Provider
                </Label>
                <Select
                  value={provider}
                  onValueChange={(v) => handleProviderChange(v as ProviderId)}
                >
                  <SelectTrigger className="w-full bg-background/50">
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

              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Model
                </Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="w-full bg-background/50">
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

              {activeProvider.needsKey || activeProvider.id === "groq" ? (
                <div className="space-y-1.5 md:col-span-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <KeyRound className="h-3 w-3" />
                      {activeProvider.label} API Key {activeProvider.id === "groq" ? "(Optional)" : ""}
                    </Label>
                  </div>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setApiKey(val);
                      try {
                        if (typeof window !== "undefined") {
                          if (val.trim()) {
                            localStorage.setItem(`cc_api_key_${activeProvider.id}`, val.trim());
                          } else {
                            localStorage.removeItem(`cc_api_key_${activeProvider.id}`);
                          }
                        }
                      } catch {
                        // Ignore localStorage errors
                      }
                    }}
                    placeholder={activeProvider.keyHint}
                    autoComplete="off"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {activeProvider.id === "groq"
                      ? "⚡ Built-in Groq key is used automatically if left empty. Your custom key is saved locally in browser storage."
                      : "💾 Your API key is saved locally in your browser storage for future sessions."}
                  </p>
                </div>
              ) : null}
            </div>

            {/* TAB 1: Classic Strategy Settings */}
            {strategyTab === "classic" && (
              <div className="mt-3.5 pt-3.5 border-t border-border/30">
                <details className="group cursor-pointer select-none">
                  <summary className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5 hover:text-foreground transition-colors">
                    <span>🛠️ Classic Strategy Parameters</span>
                    <span className="text-[8px] opacity-75 font-normal tracking-normal group-open:hidden">
                      (Click to Expand)
                    </span>
                  </summary>

                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 pt-3.5 mt-2 border-t border-border/20">
                    <div className="space-y-1 bg-background/40 p-2.5 rounded-lg border border-border/40">
                      <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                        <span>Min Confluence</span>
                        <span className="text-foreground font-bold font-mono">{minScore}/100</span>
                      </div>
                      <input
                        type="range"
                        min="40"
                        max="85"
                        step="5"
                        value={minScore}
                        onChange={(e) => setMinScore(Number(e.target.value))}
                        className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer mt-1"
                      />
                    </div>

                    <div className="space-y-1 bg-background/40 p-2.5 rounded-lg border border-border/40">
                      <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                        <span>Min R:R Ratio</span>
                        <span className="text-foreground font-bold font-mono">
                          {minRR.toFixed(1)}R
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="3.0"
                        step="0.25"
                        value={minRR}
                        onChange={(e) => setMinRR(Number(e.target.value))}
                        className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer mt-1"
                      />
                    </div>

                    <div className="space-y-1 bg-background/40 p-2.5 rounded-lg border border-border/40">
                      <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                        <span>ATR Buffer</span>
                        <span className="text-foreground font-bold font-mono">
                          {atrMult.toFixed(1)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3.0"
                        step="0.25"
                        value={atrMult}
                        onChange={(e) => setAtrMult(Number(e.target.value))}
                        className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer mt-1"
                      />
                    </div>

                    <div className="space-y-1 bg-background/40 p-2.5 rounded-lg border border-border/40">
                      <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                        <span>Pivot Strength</span>
                        <span className="text-foreground font-bold font-mono">{pivotStr} bars</span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="7"
                        step="1"
                        value={pivotStr}
                        onChange={(e) => setPivotStr(Number(e.target.value))}
                        className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer mt-1"
                      />
                    </div>
                  </div>
                </details>

                <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-border/40">
                  <Button
                    className="flex-grow font-semibold"
                    size="lg"
                    disabled={mutation.isPending || keyMissing || bulkScanning}
                    onClick={() => {
                      patternMutation.reset();
                      setBulkScannedResults({});
                      mutation.mutate();
                    }}
                  >
                    {mutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing Confluence...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" /> Generate Trade Setup (v1)
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-grow border-border bg-background/50 hover:bg-accent text-muted-foreground hover:text-foreground"
                    size="lg"
                    disabled={patternMutation.isPending || bulkScanning}
                    onClick={() => {
                      mutation.reset();
                      setBulkScannedResults({});
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
                  <Button
                    variant="default"
                    className="flex-grow bg-bull/90 hover:bg-bull text-white font-bold"
                    size="lg"
                    disabled={
                      mutation.isPending || patternMutation.isPending || bulkScanning || keyMissing
                    }
                    onClick={handleScanAll}
                  >
                    {bulkScanning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning (
                        {bulkProgress.current}/{bulkProgress.total})...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" /> Scan All Coins
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* TAB 2: Institutional OTE Strategy Settings */}
            {strategyTab === "ote" && (
              <div className="mt-3.5 pt-3.5 border-t border-border/30">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5 mb-3">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                    <Flame className="h-4 w-4" /> 4-Pillar Smart Money OTE Methodology
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Strict institutional trade cycle: 1. HTF Macro Bias & Liquidity Map $\to$ 2.
                    Liquidity Purge (PDH/PDL Sweep) $\to$ 3. Institutional Displacement (MSS & FVG)
                    $\to$ 4. Retest of 61.8%–78.6% OTE Golden Zone.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 pt-2">
                  <div className="space-y-1 bg-background/40 p-3 rounded-lg border border-border/40">
                    <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                      <span>Minimum Required R:R</span>
                      <span className="text-foreground font-bold font-mono">
                        {oteMinRR.toFixed(1)}R
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1.5"
                      max="4.0"
                      step="0.25"
                      value={oteMinRR}
                      onChange={(e) => setOteMinRR(Number(e.target.value))}
                      className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer mt-1"
                    />
                    <span className="text-[9px] text-muted-foreground/80 block">
                      Rejects trades without at least {oteMinRR}R to opposing liquidity
                    </span>
                  </div>

                  <div className="space-y-1 bg-background/40 p-3 rounded-lg border border-border/40">
                    <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                      <span>Minimum Setup Grade</span>
                      <span className="text-foreground font-bold font-mono">
                        Grade {oteMinGrade}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {(["B", "A", "A+"] as const).map((grade) => (
                        <button
                          key={grade}
                          type="button"
                          onClick={() => setOteMinGrade(grade)}
                          className={cn(
                            "rounded py-1 text-xs font-bold border transition-colors",
                            oteMinGrade === grade
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background/60 text-muted-foreground border-border hover:bg-accent",
                          )}
                        >
                          Grade {grade}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-border/40">
                  <Button
                    className="flex-grow font-bold bg-amber-500 hover:bg-amber-600 text-black"
                    size="lg"
                    disabled={oteMutation.isPending || keyMissing || bulkScanning}
                    onClick={() => {
                      setOteBulkResults({});
                      oteMutation.mutate();
                    }}
                  >
                    {oteMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-black" /> Analyzing
                        Institutional OTE...
                      </>
                    ) : (
                      <>
                        <Flame className="mr-2 h-4 w-4 text-black" /> Generate OTE Setup (v2)
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    className="flex-grow border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold"
                    size="lg"
                    disabled={oteMutation.isPending || bulkScanning || keyMissing}
                    onClick={handleOteScanAll}
                  >
                    {bulkScanning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning (
                        {bulkProgress.current}/{bulkProgress.total})...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4 text-amber-400" /> OTE Scan All Coins
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Error Display */}
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
            </div>
          ) : null}

          {/* Loading Skeletons */}
          {(mutation.isPending || oteMutation.isPending) && (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-xl" />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          )}

          {/* TAB 1: Classic Report Display */}
          {strategyTab === "classic" && mutation.data && !mutation.isPending && (
            <SignalReport result={mutation.data} />
          )}

          {/* TAB 2: Institutional OTE Report Display */}
          {strategyTab === "ote" && oteMutation.data && !oteMutation.isPending && (
            <OteSignalReport result={oteMutation.data} />
          )}

          {/* Pattern Dashboard */}
          {patternMutation.data && !patternMutation.isPending && (
            <PatternDashboard
              symbol={symbol}
              timeframe={timeframe}
              patterns={patternMutation.data.patterns}
              candles={patternMutation.data.candles}
            />
          )}

          {/* Bulk Results Table for Classic */}
          {strategyTab === "classic" && Object.keys(bulkScannedResults).length > 0 && (
            <section className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                All Coins Scan Results ({timeframe.toUpperCase()})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {Object.entries(bulkScannedResults).map(([sym, res]) => (
                  <div
                    key={sym}
                    className="p-3 rounded-lg border border-border/40 bg-background/50 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-sm text-foreground">{sym}</span>
                      {res.ok ? (
                        <span
                          className={cn(
                            "block text-xs font-semibold",
                            res.data.direction === "LONG"
                              ? "text-bull"
                              : res.data.direction === "SHORT"
                                ? "text-bear"
                                : "text-muted-foreground",
                          )}
                        >
                          {res.data.direction} ({res.data.confluenceScore}/100)
                        </span>
                      ) : (
                        <span className="block text-xs text-bear">Failed</span>
                      )}
                    </div>
                    {res.ok && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSymbol(sym);
                          mutation.mutate();
                        }}
                        className="text-xs h-7"
                      >
                        View
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bulk Results Table for OTE */}
          {strategyTab === "ote" && Object.keys(oteBulkResults).length > 0 && (
            <section className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-400" /> All Coins Institutional OTE Scans (
                {timeframe.toUpperCase()})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {Object.entries(oteBulkResults).map(([sym, res]) => (
                  <div
                    key={sym}
                    className="p-3 rounded-lg border border-border/40 bg-background/50 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-foreground">{sym}</span>
                        {res.ok && res.data.setupGrade !== "NO_SETUP" && (
                          <span className="text-[9px] font-black px-1.5 rounded bg-amber-400/20 text-amber-300">
                            {res.data.setupGrade}
                          </span>
                        )}
                      </div>
                      {res.ok ? (
                        <span
                          className={cn(
                            "block text-xs font-semibold",
                            res.data.direction === "LONG"
                              ? "text-bull"
                              : res.data.direction === "SHORT"
                                ? "text-bear"
                                : "text-muted-foreground",
                          )}
                        >
                          {res.data.direction} (Quality: {res.data.qualityScore}/100)
                        </span>
                      ) : (
                        <span className="block text-xs text-bear">Failed</span>
                      )}
                    </div>
                    {res.ok && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSymbol(sym);
                          oteMutation.mutate();
                        }}
                        className="text-xs h-7"
                      >
                        View OTE
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Active Tracked Trades Card */}
          <TradeTrackerCard />
        </div>

        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      </main>
    </TradeTrackerProvider>
  );
}
