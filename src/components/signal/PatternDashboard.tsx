import React, { useState } from "react";
import type { Candle } from "../../lib/indicators";
import type { DetectedPattern } from "../../lib/patterns";
import { PatternChart } from "./PatternChart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Maximize2, Share2, Sparkles, TrendingUp, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

interface PatternDashboardProps {
  patterns: DetectedPattern[];
  candles: Candle[];
  symbol: string;
  timeframe: string;
}

export function PatternDashboard({ patterns, candles, symbol, timeframe }: PatternDashboardProps) {
  const [selectedPattern, setSelectedPattern] = useState<DetectedPattern | null>(null);

  const handleSharePattern = (p: DetectedPattern) => {
    const text = `🔍 Crypto Compass Analysis: ${symbol}/USDT (${timeframe.toUpperCase()})\n📈 Pattern Detected: ${p.name} (${p.confidence}% Confidence)\n📊 Status: ${p.status.toUpperCase().replace("_", " ")}\n🎯 Target: $${p.targetPrice.toLocaleString()}\n🚨 Invalidation: $${p.invalidPrice.toLocaleString()}\n\n📝 Details: ${p.description}`;
    
    try {
      navigator.clipboard.writeText(text);
      toast.success("Pattern analysis details copied to clipboard!");
    } catch (e) {
      toast.error("Failed to copy details to clipboard.");
    }
  };

  if (patterns.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-card/25 p-8 text-center">
        <Compass className="mx-auto h-8 w-8 text-muted-foreground opacity-50" />
        <h3 className="mt-3 text-sm font-semibold text-foreground">No definitive patterns detected</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Market consolidation or noise is high on this timeframe. Try switching timeframes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary animate-pulse" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">
          Detected Chart Patterns ({patterns.length})
        </h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {patterns.map((p) => {
          const isBullish = p.name.includes("Bottom") || p.name.includes("Bull") || p.name.includes("Ascending");
          
          return (
            <div
              key={p.id}
              className="flex flex-col rounded-xl border border-border/50 bg-card/45 p-4 transition-all hover:border-border/80 hover:bg-card/75 shadow-lg min-w-0"
            >
              {/* Pattern Header */}
              <div className="flex items-start justify-between gap-2 border-b border-border/30 pb-2.5">
                <div>
                  <h4 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    {p.name}
                  </h4>
                  <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                    <span className="text-[8px] bg-muted/40 px-1 py-0.25 rounded text-muted-foreground uppercase font-bold tracking-wider">
                      {p.category}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Conf: <span className="font-semibold text-primary">{p.confidence}%</span>
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                        isBullish
                          ? "bg-bull/15 text-bull border border-bull/30"
                          : "bg-bear/15 text-bear border border-bear/30"
                      )}
                    >
                      {p.status.replace("_", " ")}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedPattern(p)}
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  
                  {/* Volume Verification Badge */}
                  {p.volumeStatus === "verified" ? (
                    <span className="rounded px-1.5 py-0.25 text-[8px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                      ✓ Vol Verified ({p.breakoutVolumeRatio}x)
                    </span>
                  ) : p.volumeStatus === "weak" ? (
                    <span className="rounded px-1.5 py-0.25 text-[8px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                      ⚠ Low Vol Breakout ({p.breakoutVolumeRatio}x)
                    </span>
                  ) : (
                    <span className="rounded px-1.5 py-0.25 text-[8px] font-medium bg-muted/30 text-muted-foreground border border-border/10">
                      Steady Vol ({p.breakoutVolumeRatio}x)
                    </span>
                  )}
                </div>
              </div>

              {/* Chart Body */}
              <div className="py-3">
                <PatternChart candles={candles} pattern={p} />
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground leading-relaxed flex-grow">
                {p.description}
              </p>

              {/* Pattern levels footer */}
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/30 pt-3 text-center">
                <div className="rounded bg-background/30 p-1.5 border border-border/20">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                    Target Price
                  </span>
                  <span className="font-bold text-xs text-bull tabular block">
                    ${p.targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="rounded bg-background/30 p-1.5 border border-border/20">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">
                    Invalidation
                  </span>
                  <span className="font-bold text-xs text-bear tabular block">
                    ${p.invalidPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3 pt-2 border-t border-border/20">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7.5 text-[10px] uppercase font-bold tracking-wider"
                  onClick={() => handleSharePattern(p)}
                >
                  <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share Pattern
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Maximized Pattern Modal */}
      <Dialog open={selectedPattern !== null} onOpenChange={(open) => !open && setSelectedPattern(null)}>
        <DialogContent className="max-w-3xl bg-background/95 border-border shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {selectedPattern?.name} Analysis — {symbol}/USDT ({timeframe.toUpperCase()})
            </DialogTitle>
          </DialogHeader>
          
          {selectedPattern && (
            <div className="space-y-4 pt-2">
              <PatternChart candles={candles} pattern={selectedPattern} isFullscreen={true} />
              
              <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-3">
                <p className="text-sm text-foreground leading-relaxed">
                  {selectedPattern.description}
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 text-center">
                  <div className="rounded-lg bg-background/55 p-2.5 border border-border/20">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                      Target Target
                    </span>
                    <span className="font-bold text-sm text-bull tabular mt-0.5 block">
                      ${selectedPattern.targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="rounded-lg bg-background/55 p-2.5 border border-border/20">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                      Invalidation Level
                    </span>
                    <span className="font-bold text-sm text-bear tabular mt-0.5 block">
                      ${selectedPattern.invalidPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="rounded-lg bg-background/55 p-2.5 border border-border/20">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                      Detection Confidence
                    </span>
                    <span className="font-bold text-sm text-primary tabular mt-0.5 block">
                      {selectedPattern.confidence}% Match
                    </span>
                  </div>
                  <div className="rounded-lg bg-background/55 p-2.5 border border-border/20">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                      Volume Check
                    </span>
                    <span className="font-bold text-sm text-foreground mt-0.5 block">
                      {selectedPattern.volumeStatus === "verified" ? (
                        <span className="text-green-400">✓ Verified ({selectedPattern.breakoutVolumeRatio}x)</span>
                      ) : selectedPattern.volumeStatus === "weak" ? (
                        <span className="text-yellow-400">⚠ Weak ({selectedPattern.breakoutVolumeRatio}x)</span>
                      ) : (
                        <span className="text-muted-foreground">Steady ({selectedPattern.breakoutVolumeRatio}x)</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => handleSharePattern(selectedPattern)}
                  className="h-8.5 text-[10px] uppercase font-bold tracking-wider"
                >
                  <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share Pattern
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setSelectedPattern(null)}
                  className="h-8.5 text-[10px] uppercase font-bold tracking-wider"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
