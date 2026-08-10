import React, { useEffect, useRef } from "react";
import type { Candle } from "../../lib/indicators";
import type { DetectedPattern } from "../../lib/patterns";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface PatternChartProps {
  candles: Candle[];
  pattern: DetectedPattern;
  isFullscreen?: boolean;
}

export function PatternChart({ candles, pattern, isFullscreen = false }: PatternChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);

  const height = isFullscreen ? 380 : 200;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let chart: any = null;
    let resizeObserver: ResizeObserver | null = null;

    const initChart = async () => {
      // Dynamic import to prevent Server-Side Rendering (SSR) crashes
      const { createChart, ColorType, LineStyle } = await import("lightweight-charts");

      if (!chartContainerRef.current) return;

      const convertTime = (t: number) => {
        return t > 1000000000000 ? Math.floor(t / 1000) : t;
      };

      // Fallback width if clientWidth is 0 during hidden/tab renders
      const initialWidth = chartContainerRef.current.clientWidth || 500;

      // Initialize chart
      chart = createChart(chartContainerRef.current, {
        width: initialWidth,
        height: height,
        layout: {
          background: { type: ColorType.Solid, color: "#09090b" },
          textColor: "#a1a1aa",
          fontSize: 10,
          fontFamily: "Inter, sans-serif",
        },
        grid: {
          vertLines: { color: "#18181b" },
          horzLines: { color: "#18181b" },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: {
            top: 0.15,
            bottom: 0.15,
          },
        },
        crosshair: {
          vertLine: {
            color: "#3f3f46",
            labelBackgroundColor: "#27272a",
          },
          horzLine: {
            color: "#3f3f46",
            labelBackgroundColor: "#27272a",
          },
        },
      });

      chartInstanceRef.current = chart;

      // Create candlestick series
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: "#0ecb81",
        downColor: "#f6465d",
        borderUpColor: "#0ecb81",
        borderDownColor: "#f6465d",
        wickUpColor: "#0ecb81",
        wickDownColor: "#f6465d",
      });

      // Format, deduplicate, and sort candles by timestamp (Lightweight Charts strict rule)
      const seenTimes = new Set<number>();
      const formattedCandles = candles
        .map((c) => ({
          time: convertTime(c.time),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
        .filter((c) => {
          if (seenTimes.has(c.time)) return false;
          seenTimes.add(c.time);
          return true;
        })
        .sort((a, b) => a.time - b.time);

      candlestickSeries.setData(formattedCandles);

      // Overlay pattern geometric lines
      pattern.lines.forEach((l) => {
        const startCandle = candles[l.startIndex];
        const endCandle = candles[l.endIndex];

        if (startCandle && endCandle) {
          const tStart = convertTime(startCandle.time);
          const tEnd = convertTime(endCandle.time);

          // Prevent zero-span lines as duplicate keys on the same series will crash the chart
          if (tStart === tEnd) return;

          const lineSeries = chart.addAreaSeries({
            lineColor: l.color === "var(--bull)" ? "#0ecb81" : l.color === "var(--bear)" ? "#f6465d" : "#3b82f6",
            topColor: "rgba(0, 0, 0, 0)",
            bottomColor: "rgba(0, 0, 0, 0)",
            lineWidth: 1.8,
            lineStyle: l.style === "dashed" ? LineStyle.Dashed : LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: false,
          });

          const dataPoints = [
            { time: tStart as any, value: l.startPrice },
            { time: tEnd as any, value: l.endPrice },
          ].sort((a, b) => a.time - b.time);

          lineSeries.setData(dataPoints);
        }
      });

      // Setup point markers (Bottoms, Tops, Shoulder wicks) without duplicates
      const seenMarkers = new Set<number>();
      const markers = pattern.points
        .map((p) => {
          const candle = candles[p.index];
          if (!candle) return null;

          const timeSec = convertTime(candle.time);
          if (seenMarkers.has(timeSec)) return null;
          seenMarkers.add(timeSec);

          const isLow = p.price < (candle.open + candle.close) / 2;
          return {
            time: timeSec as any,
            position: isLow ? ("belowBar" as const) : ("aboveBar" as const),
            color: p.label?.includes("Bottom") || p.label?.includes("Support") ? "#0ecb81" : p.label?.includes("Top") || p.label?.includes("Resistance") ? "#f6465d" : "#3b82f6",
            shape: p.label?.includes("Bottom") || p.label?.includes(" t1") ? ("arrowUp" as const) : p.label?.includes("Top") || p.label?.includes(" peak") ? ("arrowDown" as const) : ("circle" as const),
            text: p.label || "",
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .sort((a, b) => (a.time as number) - (b.time as number));

      candlestickSeries.setMarkers(markers);

      // Auto-fit contents in viewport
      chart.timeScale().fitContent();

      // Resize listener
      resizeObserver = new ResizeObserver(() => {
        if (chart && chartContainerRef.current) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth || 500,
          });
          chart.timeScale().fitContent();
        }
      });
      resizeObserver.observe(chartContainerRef.current);
    };

    initChart();

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (chart) {
        chart.remove();
      }
      chartInstanceRef.current = null;
    };
  }, [candles, pattern, height]);

  // Export Screenshot PNG
  const handleDownloadPNG = () => {
    if (!chartInstanceRef.current) return;
    const canvas = chartInstanceRef.current.takeScreenshot();
    if (!canvas) return;

    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `${pattern.name.toLowerCase().replace(/\s+/g, "_")}_chart.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col space-y-2 w-full">
      <div
        ref={chartContainerRef}
        className="w-full rounded-lg border border-border/40 bg-background/90 overflow-hidden relative"
        style={{ height: `${height}px` }}
      />
      <div className="flex justify-end pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownloadPNG}
          className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground hover:text-foreground h-6 px-2"
        >
          <Download className="mr-1.5 h-3 w-3" /> Save Chart PNG
        </Button>
      </div>
    </div>
  );
}
