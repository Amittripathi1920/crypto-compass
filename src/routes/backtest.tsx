import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Activity, BarChart3, ChevronLeft, Loader2, Play, ShieldAlert, Award, TrendingUp, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COINS, TIMEFRAMES, type Timeframe } from "@/lib/coins";
import { runHistoricalBacktest, getBacktestHistory } from "@/lib/signal.functions";
import { fmtPrice } from "@/components/signal/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "Strategy Backtesting Dashboard — Crypto Compass" },
      { name: "description", content: "Test confluence strategy models against historical market data." },
    ],
  }),
  component: BacktestDashboard,
});

function BacktestDashboard() {
  const [symbol, setSymbol] = useState("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  
  // Strategy overrides parameters
  const [minScore, setMinScore] = useState(60);
  const [minRR, setMinRR] = useState(1.5);
  const [atrMult, setAtrMult] = useState(1.5);
  const [pivotStr, setPivotStr] = useState(4);
  const [historyRuns, setHistoryRuns] = useState<any[]>([]);

  const runBacktestFn = useServerFn(runHistoricalBacktest);
  const fetchHistoryFn = useServerFn(getBacktestHistory);

  const loadHistory = async () => {
    try {
      const data = await fetchHistoryFn();
      setHistoryRuns(data);
    } catch (e) {
      console.warn("Failed to load backtest history:", e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const backtestMutation = useMutation({
    mutationFn: () =>
      runBacktestFn({
        data: {
          symbol,
          timeframe,
          config: {
            minimumScore: minScore,
            minimumSetupScore: minScore,
            minimumEntryScore: minScore,
            minimumRR: minRR,
            atrMultiplier: atrMult,
            pivotStrength: pivotStr,
          },
        },
      }),
    onSuccess: () => {
      loadHistory();
    },
  });

  const res = backtestMutation.data;

  // Build Equity Curve SVG points
  const equityPoints = useMemo(() => {
    if (!res || !res.trades || res.trades.length === 0) return null;
    let balance = 1000;
    const points = [{ x: 0, y: balance }];
    
    res.trades.forEach((t, idx) => {
      balance += t.rMultiple * 10; // 1% risk of $10 per trade
      points.push({ x: idx + 1, y: balance });
    });
    
    const balances = points.map((p) => p.y);
    const max = Math.max(...balances, 1000);
    const min = Math.min(...balances, 900);
    const range = max - min || 1;
    
    const W = 700;
    const H = 150;
    const padding = 10;
    
    const xStep = (W - padding * 2) / (points.length - 1 || 1);
    const yCoord = (b: number) => H - padding - ((b - min) / range) * (H - padding * 2);
    
    const svgPath = points
      .map((p, idx) => `${idx === 0 ? "M" : "L"}${padding + idx * xStep} ${yCoord(p.y)}`)
      .join(" ");
      
    const fillPath = `${svgPath} L ${padding + (points.length - 1) * xStep} ${H} L ${padding} ${H} Z`;
    
    return { path: svgPath, fillPath, max, min, finalBalance: balance, W, H };
  }, [res]);

  function useMemo(fn: () => any, deps: any[]) {
    return fn();
  }

  return (
    <main className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <div className="terminal-grid border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold uppercase tracking-wider"
            >
              <ChevronLeft className="h-4 w-4" /> Lab Dashboard
            </Link>
            <div className="flex items-center gap-2 text-primary">
              <Activity className="h-4 w-4" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">
                Backtesting Framework
              </span>
            </div>
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight">
            Confluence Strategy Backtest
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Test strategy variants over historical candle intervals to optimize confluence scores and volatility stop bounds before paper trading.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Controls Panel */}
          <section className="md:col-span-1 rounded-xl border border-border bg-card/60 p-5 space-y-4 h-fit">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" /> Test Parameters
            </h3>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground block font-medium">
                  Asset
                </Label>
                <Select value={symbol} onValueChange={setSymbol}>
                  <SelectTrigger className="w-full bg-background/40">
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

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground block font-medium">
                  Primary Timeframe
                </Label>
                <Select value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
                  <SelectTrigger className="w-full bg-background/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEFRAMES.filter((t) => ["5m", "15m", "1h", "4h"].includes(t.value)).map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label} ({t.horizon.split(" ")[0]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2 border-t border-border/40 space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>Min Setup Score</span>
                    <span className="text-foreground font-bold">{minScore}</span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="90"
                    step="5"
                    value={minScore}
                    onChange={(e) => setMinScore(parseInt(e.target.value))}
                    className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>Min Risk/Reward</span>
                    <span className="text-foreground font-bold">{minRR.toFixed(1)}R</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.1"
                    value={minRR}
                    onChange={(e) => setMinRR(parseFloat(e.target.value))}
                    className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>ATR Stop Buffer</span>
                    <span className="text-foreground font-bold">{atrMult.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="2.5"
                    step="0.05"
                    value={atrMult}
                    onChange={(e) => setAtrMult(parseFloat(e.target.value))}
                    className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>Pivot Strength (L/R)</span>
                    <span className="text-foreground font-bold">{pivotStr} bars</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="8"
                    step="1"
                    value={pivotStr}
                    onChange={(e) => setPivotStr(parseInt(e.target.value))}
                    className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer"
                  />
                </div>
              </div>

              <Button
                className="w-full mt-4 h-9 gap-1.5 text-xs font-bold uppercase tracking-wider"
                disabled={backtestMutation.isPending}
                onClick={() => backtestMutation.mutate()}
              >
                {backtestMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Simulating...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" /> Run Test Engine
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* Results Panel */}
          <section className="md:col-span-2 space-y-6">
            {backtestMutation.isPending ? (
              <div className="rounded-xl border border-border bg-card/30 p-10 flex flex-col items-center justify-center space-y-3 h-96">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Running multi-timeframe backtest engine...
                </p>
                <p className="text-[10px] text-muted-foreground/60 text-center max-w-sm">
                  Fetching historical candle wicks and simulating entries/exits chronologically.
                </p>
              </div>
            ) : res ? (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-card/60 p-3.5">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                      Total Trades
                    </span>
                    <span className="text-2xl font-bold block mt-0.5">{res.totalTrades}</span>
                  </div>

                  <div className="rounded-lg border border-border bg-card/60 p-3.5">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                      Win Rate
                    </span>
                    <span className="text-2xl font-bold text-bull block mt-0.5">{res.winRate}%</span>
                  </div>

                  <div className="rounded-lg border border-border bg-card/60 p-3.5">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                      Profit Factor
                    </span>
                    <span className="text-2xl font-bold text-primary block mt-0.5">
                      {res.profitFactor}
                    </span>
                  </div>

                  <div className="rounded-lg border border-border bg-card/60 p-3.5">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                      Expectancy
                    </span>
                    <span className="text-2xl font-bold block mt-0.5">{res.expectancy} R</span>
                  </div>

                  <div className="rounded-lg border border-border bg-card/60 p-3.5">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                      Max Drawdown
                    </span>
                    <span className="text-2xl font-bold text-bear block mt-0.5">
                      -{res.maxDrawdown}%
                    </span>
                  </div>

                  <div className="rounded-lg border border-border bg-card/60 p-3.5">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                      Sharpe Ratio
                    </span>
                    <span className="text-2xl font-bold block mt-0.5">{res.sharpeRatio}</span>
                  </div>
                </div>

                {/* Equity Curve */}
                {equityPoints && (
                  <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
                    <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>Simulated Performance Curve ($1,000 start)</span>
                      <span className="font-bold text-foreground">
                        Final Balance: ${equityPoints.finalBalance.toFixed(2)}
                      </span>
                    </div>
                    <svg
                      viewBox={`0 0 ${equityPoints.W} ${equityPoints.H}`}
                      className="w-full h-36 bg-background/20 rounded border border-border/30"
                    >
                      <defs>
                        <linearGradient id="eqFade" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.1" />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={equityPoints.fillPath} fill="url(#eqFade)" />
                      <path
                        d={equityPoints.path}
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth={1.5}
                      />
                    </svg>
                    <div className="flex justify-between text-[9px] text-muted-foreground px-1">
                      <span>Start ({new Date(res.startTime).toLocaleDateString()})</span>
                      <span>End ({new Date(res.endTime).toLocaleDateString()})</span>
                    </div>
                  </div>
                )}

                {/* Trade Log */}
                <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/20">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                      Executed Trades Log
                    </h4>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {res.trades.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No trades triggered with current filters.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border hover:bg-transparent">
                            <TableHead className="text-[9px] uppercase tracking-wider font-bold">Time</TableHead>
                            <TableHead className="text-[9px] uppercase tracking-wider font-bold">Dir</TableHead>
                            <TableHead className="text-[9px] uppercase tracking-wider font-bold">Entry</TableHead>
                            <TableHead className="text-[9px] uppercase tracking-wider font-bold">Exit</TableHead>
                            <TableHead className="text-[9px] uppercase tracking-wider font-bold text-right">R multiple</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {res.trades.map((t, idx) => (
                            <TableRow key={idx} className="border-border hover:bg-muted/10">
                              <TableCell className="tabular text-[10px] text-muted-foreground">
                                {new Date(t.entryTime).toLocaleDateString()} {new Date(t.entryTime).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                              </TableCell>
                              <TableCell className={cn("text-[10px] font-bold", t.direction === "LONG" ? "text-bull" : "text-bear")}>
                                {t.direction}
                              </TableCell>
                              <TableCell className="tabular text-[10px] font-mono">{fmtPrice(t.entryPrice)}</TableCell>
                              <TableCell className="tabular text-[10px] font-mono">{fmtPrice(t.exitPrice)}</TableCell>
                              <TableCell className={cn("tabular text-[10px] font-bold text-right", t.rMultiple > 0 ? "text-bull" : t.rMultiple < 0 ? "text-bear" : "text-muted-foreground")}>
                                {t.rMultiple > 0 ? `+${t.rMultiple.toFixed(2)}` : t.rMultiple.toFixed(2)}R
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-10 flex flex-col items-center justify-center space-y-2 h-80 text-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground/45" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1">
                  Ready to simulate
                </h4>
                <p className="text-[10px] text-muted-foreground max-w-xs">
                  Configure strategy settings on the left and click "Run Test Engine" to execute historical simulations.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* History Panel */}
        {historyRuns.length > 0 && (
          <section className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <History className="h-4 w-4 text-primary" /> Previous Sim Run Reports
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {historyRuns.map((h) => (
                <div key={h.id} className="rounded border border-border/40 bg-background/45 p-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase text-foreground">
                      {h.symbol}/USDT ({h.timeframe.toUpperCase()})
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {new Date(h.runTime).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-border/20 text-[9px] text-muted-foreground text-center">
                    <div>
                      <span className="block">Trades</span>
                      <span className="font-semibold text-foreground text-xs">{h.totalTrades}</span>
                    </div>
                    <div>
                      <span className="block">Win Rate</span>
                      <span className="font-semibold text-bull text-xs">{h.winRate}%</span>
                    </div>
                    <div>
                      <span className="block">Expectancy</span>
                      <span className="font-semibold text-primary text-xs">{h.expectancy}R</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
