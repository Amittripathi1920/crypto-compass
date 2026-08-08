import type { Candle } from "@/lib/indicators";
import { fmtPrice } from "./format";

type Level = { label: string; value: number; color: string };

export function PriceChart({
  candles,
  levels,
}: {
  candles: Candle[];
  levels: Level[];
}) {
  if (candles.length === 0) return null;

  const width = 720;
  const height = 260;
  const padRight = 74;
  const plotWidth = width - padRight;

  const values = [
    ...candles.map((c) => c.high),
    ...candles.map((c) => c.low),
    ...levels.map((l) => l.value),
  ];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = span * 0.06;
  const top = max + pad;
  const bottom = min - pad;

  const y = (v: number) => ((top - v) / (top - bottom)) * (height - 20) + 10;
  const step = plotWidth / candles.length;
  const bodyW = Math.max(1.6, step * 0.6);

  return (
    <div className="w-full overflow-hidden rounded-lg border border-border bg-card/60">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[260px] w-full"
        role="img"
        aria-label="Recent price candles with trade levels"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={plotWidth}
            y1={10 + f * (height - 20)}
            y2={10 + f * (height - 20)}
            stroke="var(--grid)"
            strokeWidth={1}
          />
        ))}

        {candles.map((c, i) => {
          const cx = i * step + step / 2;
          const up = c.close >= c.open;
          const color = up ? "var(--bull)" : "var(--bear)";
          const yO = y(c.open);
          const yC = y(c.close);
          return (
            <g key={c.time}>
              <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1} />
              <rect
                x={cx - bodyW / 2}
                y={Math.min(yO, yC)}
                width={bodyW}
                height={Math.max(1, Math.abs(yC - yO))}
                fill={color}
              />
            </g>
          );
        })}

        {levels.map((l) => {
          const ly = y(l.value);
          return (
            <g key={l.label}>
              <line
                x1={0}
                x2={plotWidth}
                y1={ly}
                y2={ly}
                stroke={l.color}
                strokeWidth={1}
                strokeDasharray="5 4"
              />
              <text
                x={plotWidth + 6}
                y={ly + 3.5}
                fill={l.color}
                fontSize={10}
                fontFamily="var(--font-mono-num)"
              >
                {l.label} {fmtPrice(l.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
