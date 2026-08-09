import { useMemo, useState } from "react";
import { ema, type Candle } from "@/lib/indicators";
import { fmtPrice } from "./format";

type Level = { label: string; value: number; color: string };

const W = 760;
const H = 320;
const PAD_R = 80;
const PAD_T = 12;
const PRICE_H = 226;
const VOL_TOP = PAD_T + PRICE_H + 18;
const VOL_H = 44;
const PLOT_W = W - PAD_R;

function line(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

export function PriceChart({ candles, levels }: { candles: Candle[]; levels: Level[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (candles.length === 0) return null;
    const closes = candles.map((c) => c.close);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);

    const values = [
      ...candles.map((c) => c.high),
      ...candles.map((c) => c.low),
      ...levels.map((l) => l.value),
    ];
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    const top = max + span * 0.06;
    const bottom = min - span * 0.06;

    const y = (v: number) => ((top - v) / (top - bottom)) * PRICE_H + PAD_T;
    const step = PLOT_W / candles.length;
    const x = (i: number) => i * step + step / 2;
    const maxVol = Math.max(...candles.map((c) => c.volume)) || 1;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => top - f * (top - bottom));
    return { ema20, ema50, top, bottom, y, x, step, maxVol, ticks };
  }, [candles, levels]);

  if (!model) return null;
  const { ema20, ema50, y, x, step, maxVol, ticks } = model;
  const bodyW = Math.max(1.6, step * 0.62);
  const last = candles[candles.length - 1]!;
  const active = hover !== null ? candles[hover] : undefined;

  const emaPath = (series: number[], offset: number) =>
    line(
      series
        .map((v, i) => ({ x: x(i + offset), y: y(v) }))
        .filter((p) => Number.isFinite(p.y)),
    );

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-[var(--primary)]" /> EMA 20
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-[var(--neutral)]" /> EMA 50
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t border-dashed border-foreground/60" /> levels
          </span>
        </div>
        <p className="tabular text-[11px] text-muted-foreground">
          {active ? (
            <>
              {new Date(active.time).toLocaleString()} · O {fmtPrice(active.open)} H{" "}
              {fmtPrice(active.high)} L {fmtPrice(active.low)} C {fmtPrice(active.close)}
            </>
          ) : (
            <>
              last {fmtPrice(last.close)} · {candles.length} candles
            </>
          )}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[320px] w-full touch-none"
        role="img"
        aria-label="Recent price candles with EMAs, volume and trade levels"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          if (px > PLOT_W) return setHover(null);
          setHover(Math.min(candles.length - 1, Math.max(0, Math.floor(px / step))));
        }}
      >
        <defs>
          <linearGradient id="pcFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => {
          const ly = y(t);
          return (
            <g key={i}>
              <line x1={0} x2={PLOT_W} y1={ly} y2={ly} stroke="var(--grid)" strokeWidth={1} />
              <text
                x={PLOT_W + 6}
                y={ly + 3.5}
                fill="currentColor"
                className="text-muted-foreground"
                fontSize={9}
                fontFamily="var(--font-mono-num)"
                opacity={0.75}
              >
                {fmtPrice(t)}
              </text>
            </g>
          );
        })}

        <path
          d={`${line(candles.map((c, i) => ({ x: x(i), y: y(c.close) })))} L ${PLOT_W} ${PAD_T + PRICE_H} L 0 ${PAD_T + PRICE_H} Z`}
          fill="url(#pcFade)"
        />

        {candles.map((c, i) => {
          const cx = x(i);
          const up = c.close >= c.open;
          const color = up ? "var(--bull)" : "var(--bear)";
          const yO = y(c.open);
          const yC = y(c.close);
          const vh = (c.volume / maxVol) * VOL_H;
          return (
            <g key={c.time}>
              <line
                x1={cx}
                x2={cx}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke={color}
                strokeWidth={1}
                opacity={hover === null || hover === i ? 1 : 0.75}
              />
              <rect
                x={cx - bodyW / 2}
                y={Math.min(yO, yC)}
                width={bodyW}
                height={Math.max(1, Math.abs(yC - yO))}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.75}
              />
              <rect
                x={cx - bodyW / 2}
                y={VOL_TOP + VOL_H - vh}
                width={bodyW}
                height={Math.max(0.5, vh)}
                fill={color}
                opacity={0.4}
              />
            </g>
          );
        })}

        <path
          d={emaPath(ema20, candles.length - ema20.length)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1.4}
        />
        <path
          d={emaPath(ema50, candles.length - ema50.length)}
          fill="none"
          stroke="var(--neutral)"
          strokeWidth={1.4}
          opacity={0.9}
        />

        {levels.map((l) => {
          const ly = y(l.value);
          return (
            <g key={l.label}>
              <line
                x1={0}
                x2={PLOT_W}
                y1={ly}
                y2={ly}
                stroke={l.color}
                strokeWidth={1}
                strokeDasharray="5 4"
              />
              <rect x={PLOT_W + 2} y={ly - 7} width={PAD_R - 4} height={14} fill={l.color} rx={2} />
              <text
                x={PLOT_W + 6}
                y={ly + 3.5}
                fill="var(--background)"
                fontSize={9.5}
                fontWeight={600}
                fontFamily="var(--font-mono-num)"
              >
                {l.label} {fmtPrice(l.value)}
              </text>
            </g>
          );
        })}

        {hover !== null && active ? (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD_T}
              y2={VOL_TOP + VOL_H}
              stroke="var(--foreground)"
              strokeOpacity={0.35}
              strokeDasharray="3 3"
            />
            <circle cx={x(hover)} cy={y(active.close)} r={2.5} fill="var(--foreground)" />
          </g>
        ) : null}

        <line
          x1={0}
          x2={PLOT_W}
          y1={VOL_TOP + VOL_H}
          y2={VOL_TOP + VOL_H}
          stroke="var(--grid)"
          strokeWidth={1}
        />
        <text
          x={2}
          y={VOL_TOP - 4}
          fill="currentColor"
          className="text-muted-foreground"
          fontSize={8.5}
          opacity={0.8}
        >
          VOLUME
        </text>

        {[0, Math.floor(candles.length / 2), candles.length - 1].map((i) => (
          <text
            key={i}
            x={Math.min(PLOT_W - 40, Math.max(0, x(i) - 20))}
            y={H - 3}
            fill="currentColor"
            className="text-muted-foreground"
            fontSize={8.5}
            fontFamily="var(--font-mono-num)"
            opacity={0.8}
          >
            {new Date(candles[i]!.time).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
            })}
          </text>
        ))}
      </svg>
    </div>
  );
}
