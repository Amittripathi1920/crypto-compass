import { CheckCircle2, CircleSlash, Radio, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type Attempt = { exchange: string; ok: boolean; ms: number; error?: string };

const EXCHANGES = ["OKX", "Binance", "Kraken"] as const;

export function ExchangeStatus({
  attempts,
  candleSource,
  tickerSource,
  className,
}: {
  attempts: Attempt[];
  candleSource?: string;
  tickerSource?: string;
  className?: string;
}) {
  const byExchange = EXCHANGES.map((name) => {
    const rows = attempts.filter((a) => a.exchange === name);
    if (rows.length === 0) return { name, state: "idle" as const, ms: 0, error: undefined };
    const ok = rows.some((r) => r.ok);
    const failed = rows.find((r) => !r.ok);
    return {
      name,
      state: ok ? ("up" as const) : ("down" as const),
      ms: Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length),
      error: failed?.error,
    };
  });

  return (
    <div className={cn("rounded-xl border border-border bg-card/60 p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Radio className="h-3.5 w-3.5 text-primary" />
          <p className="text-[10px] font-semibold uppercase tracking-widest">Exchange status</p>
        </div>
        {candleSource ? (
          <p className="tabular text-[10px] text-muted-foreground">
            candles via <span className="text-primary">{candleSource}</span>
            {tickerSource ? (
              <>
                {" · "}price via <span className="text-primary">{tickerSource}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {byExchange.map((e) => {
          const Icon = e.state === "up" ? CheckCircle2 : e.state === "down" ? XCircle : CircleSlash;
          const tone =
            e.state === "up" ? "text-bull" : e.state === "down" ? "text-bear" : "text-neutral";
          const border =
            e.state === "up"
              ? "border-bull/40 bg-bull/5"
              : e.state === "down"
                ? "border-bear/40 bg-bear/5"
                : "border-border";
          return (
            <div key={e.name} className={cn("rounded-lg border p-2.5", border)}>
              <div className={cn("flex items-center gap-1.5", tone)}>
                <Icon className="h-3.5 w-3.5" />
                <p className="text-xs font-semibold">{e.name}</p>
                {e.state !== "idle" ? (
                  <span className="tabular ml-auto text-[10px] text-muted-foreground">
                    {e.ms}ms
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                {e.state === "up"
                  ? "responded with live data"
                  : e.state === "down"
                    ? (e.error ?? "request failed")
                    : "not needed — earlier source succeeded"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
