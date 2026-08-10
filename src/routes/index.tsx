import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Activity, History, KeyRound, Loader2, Sparkles, TriangleAlert } from "lucide-react";

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
import { analyzeCoin } from "@/lib/signal.functions";
import { SignalReport } from "@/components/signal/SignalReport";
import { ExchangeStatus } from "@/components/signal/ExchangeStatus";
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

function Index() {
  const [symbol, setSymbol] = useState<string>("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("4h");
  const [provider, setProvider] = useState<ProviderId>("lovable");
  const [model, setModel] = useState<string>(PROVIDERS[0]!.defaultModel);
  const [apiKey, setApiKey] = useState<string>("");
  const [lastSuccess, setLastSuccess] = useState<
    { at: string; symbol: string; timeframe: Timeframe; source: string } | null
  >(null);

  const activeProvider = useMemo(() => providerById(provider), [provider]);
  const analyze = useServerFn(analyzeCoin);

  const mutation = useMutation({
    mutationFn: () =>
      analyze({
        data: {
          symbol,
          timeframe,
          provider,
          model: model || undefined,
          apiKey: activeProvider.needsKey ? apiKey.trim() : undefined,
        },
      }),
  });

  const keyMissing = activeProvider.needsKey && apiKey.trim().length === 0;
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
    <main className="min-h-screen bg-background">
      <div className="terminal-grid border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="flex items-center gap-2 text-primary">
            <Activity className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">
              Crypto Signal Lab
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            Long or short — with the reasoning, entry, stop and targets.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Indicators are computed in code from live exchange candles, then an AI model turns them
            into a directional call with concrete trade levels. Nothing is stored — every run is
            fresh.
          </p>
          <Link
            to="/backtest"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <History className="h-3.5 w-3.5" /> Backtest these rules on history
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
                  setModel(providerById(next).defaultModel);
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
              <Select value={model} onValueChange={setModel}>
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
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={activeProvider.keyHint}
                  autoComplete="off"
                />
                <p className="text-[10px] text-muted-foreground">
                  Used only for this request and never stored.
                </p>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground md:col-span-2">
                {activeProvider.keyHint}
              </p>
            )}
          </div>

          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={mutation.isPending || keyMissing}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analysing {symbol} on {timeframe}…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Analyse {symbol} · {timeframe}
              </>
            )}
          </Button>
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

        <p className="border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
          This tool is for research and education only and is not financial advice. Crypto markets
          are volatile and leveraged trading can lose more than your deposit. Always size positions
          to your own risk tolerance and verify levels on your own chart before trading.
        </p>
      </div>
    </main>
  );
}
