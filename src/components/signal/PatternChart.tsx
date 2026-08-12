import { useMemo, useRef, useState } from "react";
import type { Candle } from "../../lib/indicators";
import type { DetectedPattern } from "../../lib/patterns";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtPrice } from "./format";

interface PatternChartProps {
  candles: Candle[];
  pattern: DetectedPattern;
  isFullscreen?: boolean;
}

const W = 760;
const PAD_R = 74;
const PAD_T = 10;
const PAD_B = 20;

const resolveColor = (c: string) =>
  c === "var(--bull)" ? "#0ecb81" : c === "var(--bear)" ? "#f6465d" : "#3b82f6";

export function PatternChart({ candles, pattern, isFullscreen = false }: PatternChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const H = isFullscreen ? 380 : 200;
  const PLOT_H = H - PAD_T - PAD_B;
  const PLOT_W = W - PAD_R;

  const model = useMemo(() => {
    if (candles.length === 0) return null;

    // Focus window: from the earliest pattern feature (with lead-in) to the end
    const idxs = [
      ...pattern.points.map((p) => p.index),
      ...pattern.lines.flatMap((l) => [l.startIndex, l.endIndex]),
    ].filter((i) => Number.isFinite(i));
    const minIdx = Math.max(0, Math.min(...(idxs.length ? idxs : [0])) - 6);
    const view = candles.slice(minIdx);
    if (view.length === 0) return null;

    const overlayPrices = [
      ...pattern.points.map((p) => p.price),
      ...pattern.lines.flatMap((l) => [l.startPrice, l.endPrice]),
      pattern.targetPrice,
      pattern.invalidPrice,
    ].filter((v) => Number.isFinite(v));

    const highs = view.map((c) => c.high);
    const lows = view.map((c) => c.low);
    const rawMax = Math.max(...highs, ...overlayPrices);
    const rawMin = Math.min(...lows, ...overlayPrices);
    const span = rawMax - rawMin || Math.max(1e-8, rawMax * 0.01);
    const top = rawMax + span * 0.08;
    const bottom = rawMin - span * 0.08;

    const y = (v: number) => ((top - v) / (top - bottom)) * PLOT_H + PAD_T;
    const step = PLOT_W / view.length;
    const x = (i: number) => (i - minIdx) * step + step / 2;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => top - f * (top - bottom));

    return { view, minIdx, y, x, step, ticks };
  }, [candles, pattern, PLOT_H, PLOT_W]);

  const handleDownloadPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${pattern.name.toLowerCase().replace(/\s+/g, "_")}_chart.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  };

  if (!model) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-border/40 bg-background/90 text-[10px] uppercase tracking-widest text-muted-foreground"
        style={{ height: `${H}px` }}
      >
        No candle data
      </div>
    );
  }

  const { view, minIdx, y, x, step, ticks } = model;
  const bodyW = Math.max(1.4, step * 0.62);
  const active = hover !== null ? view[hover] : undefined;

  const clampX = (i: number) => Math.min(PLOT_W - 1, Math.max(1, x(i)));

  return (
    <div className="flex w-full flex-col space-y-2 text-left">
      <div className="relative w-full overflow-hidden rounded-lg border border-border/40 bg-background/90">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            if (px > PLOT_W) return setHover(null);
            const i = Math.floor(px / step);
            setHover(i >= 0 && i < view.length ? i : null);
          }}
        >
          {/* grid + price axis */}
          {ticks.map((t, i) => (
            <g key={`t${i}`}>
              <line x1={0} x2={PLOT_W} y1={y(t)} y2={y(t)} stroke="#18181b" strokeWidth={1} />
              <text x={PLOT_W + 6} y={y(t) + 3} fill="#71717a" fontSize={9} fontFamily="monospace">
                {fmtPrice(t)}
              </text>
            </g>
          ))}

          {/* candles */}
          {view.map((c, i) => {
            const up = c.close >= c.open;
            const col = up ? "#0ecb81" : "#f6465d";
            const cx = i * step + step / 2;
            const yo = y(c.open);
            const yc = y(c.close);
            return (
              <g key={c.time + "-" + i}>
                <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth={1} />
                <rect
                  x={cx - bodyW / 2}
                  y={Math.min(yo, yc)}
                  width={bodyW}
                  height={Math.max(1, Math.abs(yc - yo))}
                  fill={col}
                />
              </g>
            );
          })}

          {/* target / invalidation levels */}
          {[
            { v: pattern.targetPrice, label: "TGT", color: "#0ecb81" },
            { v: pattern.invalidPrice, label: "INV", color: "#f6465d" },
          ]
            .filter((l) => Number.isFinite(l.v))
            .map((l) => (
              <g key={l.label}>
                <line
                  x1={0}
                  x2={PLOT_W}
                  y1={y(l.v)}
                  y2={y(l.v)}
                  stroke={l.color}
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  opacity={0.8}
                />
                <text x={PLOT_W + 6} y={y(l.v) - 3} fill={l.color} fontSize={8} fontFamily="monospace">
                  {l.label}
                </text>
              </g>
            ))}

          {/* pattern lines */}
          {pattern.lines.map((l, i) => {
            const c = resolveColor(l.color);
            const x1 = clampX(l.startIndex);
            const x2 = clampX(l.endIndex);
            return (
              <line
                key={`l${i}`}
                x1={x1}
                x2={Math.abs(x2 - x1) < 2 ? x1 + 2 : x2}
                y1={y(l.startPrice)}
                y2={y(l.endPrice)}
                stroke={c}
                strokeWidth={1.6}
                strokeDasharray={l.style === "dashed" ? "5 4" : undefined}
                strokeLinecap="round"
              />
            );
          })}

          {/* pattern points */}
          {pattern.points.map((p, i) => {
            const candle = candles[p.index];
            if (!candle) return null;
            const px = clampX(p.index);
            const py = y(p.price);
            const isLow = p.price < (candle.open + candle.close) / 2;
            const col = /Bottom|Support|Base/i.test(p.label ?? "")
              ? "#0ecb81"
              : /Top|Resistance|Head|Shoulder/i.test(p.label ?? "")
                ? "#f6465d"
                : "#3b82f6";
            return (
              <g key={`p${i}`}>
                <circle cx={px} cy={py} r={2.6} fill={col} stroke="#09090b" strokeWidth={0.8} />
                {p.label ? (
                  <text
                    x={px}
                    y={isLow ? py + 12 : py - 6}
                    fill={col}
                    fontSize={8}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {p.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* crosshair */}
          {hover !== null && view[hover] ? (
            <line
              x1={hover * step + step / 2}
              x2={hover * step + step / 2}
              y1={PAD_T}
              y2={PAD_T + PLOT_H}
              stroke="#3f3f46"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}

          {/* time labels */}
          <text x={2} y={H - 6} fill="#52525b" fontSize={8} fontFamily="monospace">
            {new Date(view[0]!.time).toLocaleDateString()}
          </text>
          <text
            x={PLOT_W - 2}
            y={H - 6}
            fill="#52525b"
            fontSize={8}
            fontFamily="monospace"
            textAnchor="end"
          >
            {new Date(view[view.length - 1]!.time).toLocaleDateString()}
          </text>
        </svg>

        {active ? (
          <div className="pointer-events-none absolute left-2 top-2 rounded border border-border/60 bg-background/95 px-2 py-1 font-mono text-[9px] leading-tight text-muted-foreground">
            <div>{new Date(active.time).toLocaleString()}</div>
            <div>
              O {fmtPrice(active.open)} H {fmtPrice(active.high)}
            </div>
            <div>
              L {fmtPrice(active.low)} C {fmtPrice(active.close)}
            </div>
          </div>
        ) : (
          <div className="pointer-events-none absolute left-2 top-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
            {pattern.name} · {view.length} candles · idx {minIdx}+
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownloadPNG}
          className="h-6 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <Download className="mr-1.5 h-3 w-3" /> Save Chart PNG
        </Button>
      </div>
    </div>
  );
}
