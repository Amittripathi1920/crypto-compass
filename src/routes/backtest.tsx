import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import {
  Activity,
  BarChart3,
  ChevronLeft,
  Loader2,
  Play,
  ShieldAlert,
  Award,
  TrendingUp,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { COINS, TIMEFRAMES, type Timeframe } from "@/lib/coins";
import { runHistoricalBacktest, getBacktestHistory } from "@/lib/signal.functions";
import { fmtPrice } from "@/components/signal/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "Strategy Backtesting Dashboard — Crypto Compass" },
      {
        name: "description",
        content: "Test confluence strategy models against historical market data.",
      },
    ],
  }),
  component: BacktestDashboard,
});

type BacktestHistoryItem = {
  id: string;
  symbol: string;
  timeframe: string;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  runTime: string | Date;
};

function BacktestDashboard() {
  const [symbol, setSymbol] = useState("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");

  // Strategy override parameters
  const [minScore, setMinScore] = useState(60);
  const [minRR, setMinRR] = useState(1.5);
  const [atrMult, setAtrMult] = useState(1.5);
  const [pivotStr, setPivotStr] = useState(4);
  const [historyRuns, setHistoryRuns] = useState<BacktestHistoryItem[]>([]);

  const runBacktestFn = useServerFn(runHistoricalBacktest);
  const fetchHistoryFn = useServerFn(getBacktestHistory);

  const loadHistory = async () => {
    try {
      const data = await fetchHistoryFn();
      setHistoryRuns((data || []) as BacktestHistoryItem[]);
    } catch (e) {
      console.warn("Failed to load backtest history:", e);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const backtestMutation = useMutation({
    mutationFn: () =>
      runBacktestFn({
        data: {
          symbol,
          timeframe,
          config: {
            minimumConfluenceScore: minScore,
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
          <h1 className="mt-4 text-3xl font-bold leading-tight">Confluence Strategy Backtest</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Test strategy variants over historical candle intervals to optimize confluence scores
            and volatility stop bounds before paper trading.
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
                    {TIMEFRAMES.filter((t) => ["5m", "15m", "1h", "4h"].includes(t.value)).map(
                      (t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label} ({t.horizon.split(" ")[0]})
                        </SelectItem>
                      ),
                    )}
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
                    onChange={(e) => setMinScore(Number(e.target.value))}
                    className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>Min Risk/Reward (R:R)</span>
                    <span className="text-foreground font-bold">{minRR.toFixed(1)}R</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.25"
                    value={minRR}
                    onChange={(e) => setMinRR(Number(e.target.value))}
                    className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>ATR Buffer Multiplier</span>
                    <span className="text-foreground font-bold">{atrMult.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.25"
                    value={atrMult}
                    onChange={(e) => setAtrMult(Number(e.target.value))}
                    className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>Pivot Detection Strength</span>
                    <span className="text-foreground font-bold">{pivotStr} bars</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="7"
                    step="1"
                    value={pivotStr}
                    onChange={(e) => setPivotStr(Number(e.target.value))}
                    className="w-full accent-primary bg-muted border border-border h-1 rounded-full cursor-pointer"
                  />
                </div>
              </div>

              <Button
                className="w-full font-bold uppercase tracking-wider text-xs h-10 gap-1.5"
                disabled={backtestMutation.isPending}
                onClick={() => backtestMutation.mutate()}
              >
                {backtestMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Simulating Trades...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> Run Test Engine
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* Results Overview */}
          <section className="md:col-span-2 space-y-4">
            {res ? (
              <div className="space-y-4">
                {/* Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 rounded-lg border border-border bg-card/60">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                      Total Signals
                    </span>
                    <span className="tabular text-lg font-bold text-foreground block mt-0.5">
                      {res.totalTrades}
                    </span>
                    <span className="text-[9px] text-muted-foreground">300 candles scanned</span>
                  </div>

                  <div className="p-3 rounded-lg border border-border bg-card/60">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                      Win Rate
                    </span>
                    <span
                      className={cn(
                        "tabular text-lg font-bold block mt-0.5",
                        res.winRate >= 50 ? "text-bull" : "text-bear",
                      )}
                    >
                      {res.winRate}%
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {res.trades.filter((t) => t.result === "WIN").length}W /{" "}
                      {res.trades.filter((t) => t.result === "LOSS").length}L
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-border bg-card/60">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                      Profit Factor
                    </span>
                    <span
                      className={cn(
                        "tabular text-lg font-bold block mt-0.5",
                        res.profitFactor >= 1.5 ? "text-bull" : "text-foreground",
                      )}
                    >
                      {res.profitFactor}x
                    </span>
                    <span className="text-[9px] text-muted-foreground">Gross Win/Loss</span>
                  </div>

                  <div className="p-3 rounded-lg border border-border bg-card/60">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                      Expectancy
                    </span>
                    <span
                      className={cn(
                        "tabular text-lg font-bold block mt-0.5",
                        res.expectancy > 0 ? "text-bull" : "text-bear",
                      )}
                    >
                      {res.expectancy > 0 ? `+${res.expectancy}` : res.expectancy}R
                    </span>
                    <span className="text-[9px] text-muted-foreground">Per setup executed</span>
                  </div>
                </div>

                {/* Additional Stats Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg border border-border/40 bg-card/30 flex justify-between items-center text-xs">
                    <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
                      Max Drawdown:
                    </span>
                    <span className="font-bold text-bear font-mono">-{res.maxDrawdown}%</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-border/40 bg-card/30 flex justify-between items-center text-xs">
                    <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
                      Sharpe Ratio:
                    </span>
                    <span className="font-bold text-foreground font-mono">{res.sharpeRatio}</span>
                  </div>
                </div>

                {/* Equity Curve SVG Chart */}
                {equityPoints && (
                  <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-primary" /> Simulated Equity Growth
                        (1% Risk / Trade)
                      </span>
                      <span
                        className={cn(
                          "font-bold text-xs font-mono",
                          equityPoints.finalBalance >= 1000 ? "text-bull" : "text-bear",
                        )}
                      >
                        ${equityPoints.finalBalance.toFixed(0)} ($
                        {equityPoints.finalBalance >= 1000
                          ? `+${(equityPoints.finalBalance - 1000).toFixed(0)}`
                          : `${(equityPoints.finalBalance - 1000).toFixed(0)}`}
                        )
                      </span>
                    </div>

                    <div className="relative w-full overflow-hidden pt-2">
                      <svg
                        viewBox={`0 0 ${equityPoints.W} ${equityPoints.H}`}
                        className="w-full h-32 overflow-visible"
                      >
                        <defs>
                          <linearGradient id="eqGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <path d={equityPoints.fillPath} fill="url(#eqGradient)" />
                        <path
                          d={equityPoints.path}
                          fill="none"
                          stroke="var(--primary)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Simulated Trades Log Table */}
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold block">
                    Historical Trades Executed ({res.trades.length})
                  </span>

                  <div className="max-h-72 overflow-y-auto border border-border/40 rounded-lg">
                    {res.trades.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-4 text-center">
                        No setups qualified under current score and R:R thresholds.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[9px] uppercase tracking-wider text-muted-foreground">
                            <TableHead>Time</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Dir</TableHead>
                            <TableHead>Entry</TableHead>
                            <TableHead>Exit</TableHead>
                            <TableHead className="text-right">Return</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {res.trades.map((t) => (
                            <TableRow key={t.id} className="text-xs font-mono">
                              <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {new Date(t.entryTime).toLocaleDateString([], {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </TableCell>
                              <TableCell className="text-[10px] font-sans text-muted-foreground max-w-[120px] truncate">
                                {t.setupType}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-[10px] font-bold",
                                  t.direction === "LONG" ? "text-bull" : "text-bear",
                                )}
                              >
                                {t.direction}
                              </TableCell>
                              <TableCell className="tabular text-[10px] font-mono">
                                {fmtPrice(t.entryPrice)}
                              </TableCell>
                              <TableCell className="tabular text-[10px] font-mono">
                                {fmtPrice(t.exitPrice)}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "tabular text-[10px] font-bold text-right",
                                  t.rMultiple > 0
                                    ? "text-bull"
                                    : t.rMultiple < 0
                                      ? "text-bear"
                                      : "text-muted-foreground",
                                )}
                              >
                                {t.rMultiple > 0
                                  ? `+${t.rMultiple.toFixed(2)}`
                                  : t.rMultiple.toFixed(2)}
                                R
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
                  Configure strategy settings on the left and click "Run Test Engine" to execute
                  historical simulations.
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
                <div
                  key={h.id}
                  className="rounded border border-border/40 bg-background/45 p-3 space-y-1"
                >
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
