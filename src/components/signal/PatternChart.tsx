import React, { useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle, IChartApi } from "lightweight-charts";
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
  const chartRef = useRef<IChartApi | null>(null);

  const height = isFullscreen ? 380 : 200;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const convertTime = (t: number) => {
      return t > 1000000000000 ? Math.floor(t / 1000) : t;
    };

    // Initialize chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
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

    chartRef.current = chart;

    // Create candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#0ecb81",
      downColor: "#f6465d",
      borderUpColor: "#0ecb81",
      borderDownColor: "#f6465d",
      wickUpColor: "#0ecb81",
      wickDownColor: "#f6465d",
    });

    // Populate candles
    const formattedCandles = candles.map((c) => ({
      time: convertTime(c.time) as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candlestickSeries.setData(formattedCandles);

    // Overlay pattern geometric lines
    pattern.lines.forEach((l) => {
      const startCandle = candles[l.startIndex];
      const endCandle = candles[l.endIndex];

      if (startCandle && endCandle) {
        const lineSeries = chart.addLineSeries({
          color: l.color === "var(--bull)" ? "#0ecb81" : l.color === "var(--bear)" ? "#f6465d" : "#3b82f6",
          lineWidth: 1.8,
          lineStyle: l.style === "dashed" ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
        });

        const tStart = convertTime(startCandle.time);
        const tEnd = convertTime(endCandle.time);

        lineSeries.setData([
          { time: tStart as any, value: l.startPrice },
          { time: tEnd as any, value: l.endPrice },
        ]);
      }
    });

    // Setup point markers (Bottoms, Tops, Shoulder wicks)
    const markers = pattern.points
      .map((p) => {
        const candle = candles[p.index];
        if (!candle) return null;

        const isLow = p.price < (candle.open + candle.close) / 2;
        return {
          time: convertTime(candle.time) as any,
          position: isLow ? ("belowBar" as const) : ("aboveBar" as const),
          color: p.label?.includes("Bottom") || p.label?.includes("Support") ? "#0ecb81" : p.label?.includes("Top") || p.label?.includes("Resistance") ? "#f6465d" : "#3b82f6",
          shape: p.label?.includes("Bottom") || p.label?.includes(" t1") ? ("arrowUp" as const) : p.label?.includes("Top") || p.label?.includes(" peak") ? ("arrowDown" as const) : ("circle" as const),
          text: p.label || "",
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    candlestickSeries.setMarkers(markers);

    // Auto-fit contents in viewport
    chart.timeScale().fitContent();

    // Resize listener
    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
        chartRef.current.timeScale().fitContent();
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles, pattern, height]);

  // Export Screenshot PNG
  const handleDownloadPNG = () => {
    if (!chartRef.current) return;
    const canvas = chartRef.current.takeScreenshot();
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
