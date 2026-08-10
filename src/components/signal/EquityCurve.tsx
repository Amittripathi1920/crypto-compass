import { cn } from "@/lib/utils";

export function EquityCurve({
  points,
  className,
}: {
  points: { time: number; r: number }[];
  className?: string;
}) {
  const w = 720;
  const h = 200;
  const pad = { top: 12, right: 44, bottom: 22, left: 8 };
  const values = [0, ...points.map((p) => p.r)];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const x = (i: number) =>
    pad.left + (i / Math.max(1, values.length - 1)) * (w - pad.left - pad.right);
  const y = (v: number) => pad.top + ((max - v) / span) * (h - pad.top - pad.bottom);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} Z`;
  const last = values[values.length - 1] ?? 0;
  const positive = last >= 0;

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full" role="img" aria-label="Cumulative R curve">
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={positive ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
              stopOpacity="0.28"
            />
            <stop
              offset="100%"
              stopColor={positive ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {[max, (max + min) / 2, min].map((v) => (
          <g key={v}>
            <line
              x1={pad.left}
              x2={w - pad.right}
              y1={y(v)}
              y2={y(v)}
              stroke="hsl(var(--border))"
              strokeDasharray="3 4"
            />
            <text
              x={w - pad.right + 6}
              y={y(v) + 3}
              className="fill-muted-foreground font-mono"
              fontSize="9"
            >
              {v.toFixed(1)}R
            </text>
          </g>
        ))}

        {min < 0 && max > 0 ? (
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={y(0)}
            y2={y(0)}
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity="0.6"
          />
        ) : null}

        <path d={area} fill="url(#eqFill)" />
        <path
          d={line}
          fill="none"
          strokeWidth="2"
          stroke={positive ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
        />
        <circle
          cx={x(values.length - 1)}
          cy={y(last)}
          r="3.5"
          fill={positive ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
        />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{points[0] ? new Date(points[0].time).toLocaleDateString() : ""}</span>
        <span>{points.length} closed trades</span>
        <span>
          {points[points.length - 1]
            ? new Date(points[points.length - 1]!.time).toLocaleDateString()
            : ""}
        </span>
      </div>
    </div>
  );
}
