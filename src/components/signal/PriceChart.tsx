import { useMemo, useState } from "react";
import { ema, type Candle, rsiSeries } from "@/lib/indicators";
import { fmtPrice } from "./format";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Level = { label: string; value: number; color: string };

const W = 760;
const H = 390;
const PAD_R = 80;
const PAD_T = 12;
const PRICE_H = 200;
const PLOT_W = W - PAD_R;
const VOL_TOP = PAD_T + PRICE_H + 18;
const VOL_H = 36;
const RSI_TOP = VOL_TOP + VOL_H + 22;
const RSI_H = 68;

function line(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

export function PriceChartInner({
  candles,
  levels,
  isMaximized = false,
}: {
  candles: Candle[];
  levels: Level[];
  isMaximized?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [mouseY, setMouseY] = useState<number | null>(null);

  const model = useMemo(() => {
    if (candles.length === 0) return null;
    const closes = candles.map((c) => c.close);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const rsiValues = rsiSeries(closes, 14);

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
    return { ema20, ema50, rsiValues, top, bottom, y, x, step, maxVol, ticks };
  }, [candles, levels]);

  const rrZones = useMemo(() => {
    if (!model) return null;
    const eL = levels.find((l) => l.label === "E");
    const slL = levels.find((l) => l.label === "SL");
    const t2L = levels.find((l) => l.label === "T2");

    if (!eL || !slL || !t2L) return null;

    const entryY = model.y(eL.value);
    const slY = model.y(slL.value);
    const t2Y = model.y(t2L.value);

    const isLong = eL.value > slL.value;

    return {
      greenY: isLong ? t2Y : entryY,
      greenH: Math.abs(t2Y - entryY),
      redY: isLong ? entryY : slY,
      redH: Math.abs(slY - entryY),
    };
  }, [levels, model]);

  if (!model) return null;
  const { ema20, ema50, rsiValues, y, x, step, maxVol, ticks } = model;
  const bodyW = Math.max(1.6, step * 0.62);
  const last = candles[candles.length - 1]!;
  const active = hover !== null ? candles[hover] : undefined;
  const activeRsi = hover !== null ? rsiValues[hover] : rsiValues[rsiValues.length - 1];

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
        <div className="tabular text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
          {active ? (
            <span>
              {new Date(active.time).toLocaleString()} · O {fmtPrice(active.open)} H{" "}
              {fmtPrice(active.high)} L {fmtPrice(active.low)} C {fmtPrice(active.close)}
            </span>
          ) : (
            <span>
              last {fmtPrice(last.close)} · {candles.length} candles
            </span>
          )}
          {activeRsi !== undefined && (
            <span className="border-l border-border pl-3 text-orange-400 font-semibold">
              RSI (14): {activeRsi.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      <svg
        id="price-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        className={cn("w-full touch-none", isMaximized ? "h-[540px]" : "h-[390px]")}
        role="img"
        aria-label="Recent price candles with EMAs, volume, RSI and trade levels"
        onMouseLeave={() => {
          setHover(null);
          setMouseY(null);
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const py = ((e.clientY - rect.top) / rect.height) * H;
          if (px > PLOT_W) {
            setHover(null);
            setMouseY(null);
            return;
          }
          setHover(Math.min(candles.length - 1, Math.max(0, Math.floor(px / step))));
          setMouseY(py);
        }}
      >
        <defs>
          <linearGradient id="pcFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
          {/* Neon shadow glows for the EMA curves */}
          <filter id="ema20Glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ema50Glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Dynamic vertical grid background for hover highlight */}
        {hover !== null ? (
          <rect
            x={x(hover) - step / 2}
            y={PAD_T}
            width={step}
            height={RSI_TOP + RSI_H - PAD_T}
            fill="currentColor"
            className="text-primary/5"
          />
        ) : null}

        {/* Risk/Reward translucent zones */}
        {rrZones ? (
          <>
            {/* Profit Target Zone (Green) */}
            <rect
              x={0}
              y={rrZones.greenY}
              width={PLOT_W}
              height={rrZones.greenH}
              fill="var(--bull)"
              opacity={0.06}
            />
            {/* Stop Loss Zone (Red) */}
            <rect
              x={0}
              y={rrZones.redY}
              width={PLOT_W}
              height={rrZones.redH}
              fill="var(--bear)"
              opacity={0.06}
            />
          </>
        ) : null}

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
          strokeWidth={1.5}
          filter="url(#ema20Glow)"
        />
        <path
          d={emaPath(ema50, candles.length - ema50.length)}
          fill="none"
          stroke="var(--neutral)"
          strokeWidth={1.5}
          filter="url(#ema50Glow)"
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

        {/* RSI Sub-Panel */}
        <g>
          {/* Shaded Neutral Area (30-70) */}
          <rect
            x={0}
            y={RSI_TOP + RSI_H * 0.3}
            width={PLOT_W}
            height={RSI_H * 0.4}
            fill="var(--primary)"
            opacity={0.05}
          />
          {/* RSI Horizontal Boundaries */}
          <line
            x1={0}
            x2={PLOT_W}
            y1={RSI_TOP + RSI_H * 0.3}
            y2={RSI_TOP + RSI_H * 0.3}
            stroke="var(--grid)"
            strokeWidth={0.75}
            strokeDasharray="3 3"
          />
          <line
            x1={0}
            x2={PLOT_W}
            y1={RSI_TOP + RSI_H * 0.5}
            y2={RSI_TOP + RSI_H * 0.5}
            stroke="var(--grid)"
            strokeWidth={0.5}
            strokeDasharray="1 3"
            opacity={0.5}
          />
          <line
            x1={0}
            x2={PLOT_W}
            y1={RSI_TOP + RSI_H * 0.7}
            y2={RSI_TOP + RSI_H * 0.7}
            stroke="var(--grid)"
            strokeWidth={0.75}
            strokeDasharray="3 3"
          />

          {/* RSI Axis Value Tags */}
          <text x={PLOT_W + 6} y={RSI_TOP + RSI_H * 0.3 + 3.5} fill="currentColor" className="text-muted-foreground" fontSize={8} opacity={0.65}>70</text>
          <text x={PLOT_W + 6} y={RSI_TOP + RSI_H * 0.5 + 3.5} fill="currentColor" className="text-muted-foreground" fontSize={8} opacity={0.4}>50</text>
          <text x={PLOT_W + 6} y={RSI_TOP + RSI_H * 0.7 + 3.5} fill="currentColor" className="text-muted-foreground" fontSize={8} opacity={0.65}>30</text>

          {/* Panel label */}
          <text x={2} y={RSI_TOP - 4} fill="currentColor" className="text-muted-foreground" fontSize={8.5} opacity={0.8}>RSI (14)</text>
          
          {/* Divider lines */}
          <line x1={0} x2={PLOT_W} y1={RSI_TOP} y2={RSI_TOP} stroke="var(--grid)" strokeWidth={0.75} />
          <line x1={0} x2={PLOT_W} y1={RSI_TOP + RSI_H} y2={RSI_TOP + RSI_H} stroke="var(--grid)" strokeWidth={0.75} />

          {/* RSI Curve */}
          <path
            d={line(rsiValues.map((v, idx) => ({ x: x(idx), y: RSI_TOP + RSI_H - (v / 100) * RSI_H })))}
            fill="none"
            stroke="#f97316"
            strokeWidth={1.25}
            opacity={0.9}
          />
        </g>

        {/* Dynamic Crosshairs */}
        {hover !== null && active && (
          <g>
            {/* Vertical cursor line */}
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD_T}
              y2={RSI_TOP + RSI_H}
              stroke="var(--foreground)"
              strokeOpacity={0.25}
              strokeDasharray="2 2"
              strokeWidth={0.75}
            />
            <circle cx={x(hover)} cy={y(active.close)} r={2.5} fill="var(--foreground)" />

            {/* Horizontal cursor line & value tag */}
            {mouseY !== null && (
              <>
                {mouseY >= PAD_T && mouseY <= VOL_TOP + VOL_H ? (
                  <g>
                    <line
                      x1={0}
                      x2={PLOT_W}
                      y1={mouseY}
                      y2={mouseY}
                      stroke="var(--foreground)"
                      strokeOpacity={0.25}
                      strokeDasharray="2 2"
                      strokeWidth={0.75}
                    />
                    {/* Floating Price label on the right */}
                    <g transform={`translate(${PLOT_W + 2}, ${mouseY - 7})`}>
                      <rect width={PAD_R - 4} height={14} fill="var(--neutral)" rx={2} className="opacity-95" />
                      <text x={4} y={10.5} fill="var(--background)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono-num)">
                        {fmtPrice(model.top - ((mouseY - PAD_T) / PRICE_H) * (model.top - model.bottom))}
                      </text>
                    </g>
                  </g>
                ) : mouseY >= RSI_TOP && mouseY <= RSI_TOP + RSI_H ? (
                  <g>
                    <line
                      x1={0}
                      x2={PLOT_W}
                      y1={mouseY}
                      y2={mouseY}
                      stroke="var(--foreground)"
                      strokeOpacity={0.25}
                      strokeDasharray="2 2"
                      strokeWidth={0.75}
                    />
                    {/* Floating RSI label on the right */}
                    <g transform={`translate(${PLOT_W + 2}, ${mouseY - 7})`}>
                      <rect width={PAD_R - 4} height={14} fill="var(--neutral)" rx={2} className="opacity-95" />
                      <text x={12} y={10.5} fill="var(--background)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono-num)">
                        {Math.max(0, Math.min(100, Math.round(100 - ((mouseY - RSI_TOP) / RSI_H) * 100)))}
                      </text>
                    </g>
                  </g>
                ) : null}
              </>
            )}
          </g>
        )}

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

export function PriceChart({ candles, levels }: { candles: Candle[]; levels: Level[] }) {
  return (
    <div className="relative w-full">
      <div className="absolute right-3.5 top-[9px] z-10">
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              aria-label="Maximize chart"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[840px] border-border bg-card/95 p-5 shadow-2xl backdrop-blur-md">
            <DialogTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Maximized Price Action Visuals
            </DialogTitle>
            <div className="mt-2.5">
              <PriceChartInner candles={candles} levels={levels} isMaximized={true} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <PriceChartInner candles={candles} levels={levels} isMaximized={false} />
    </div>
  );
}
