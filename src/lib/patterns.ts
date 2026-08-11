import type { Candle } from "./indicators";

export type DetectedPattern = {
  id: string;
  name: string;
  category: "reversal" | "continuation" | "bilateral";
  type:
    | "head_shoulders"
    | "inverse_head_shoulders"
    | "double_top"
    | "double_bottom"
    | "triple_top"
    | "triple_bottom"
    | "rising_wedge"
    | "falling_wedge"
    | "bull_flag"
    | "bear_flag"
    | "bull_pennant"
    | "bear_pennant"
    | "ascending_triangle"
    | "descending_triangle"
    | "symmetrical_triangle";
  confidence: number;
  status: "forming" | "broken_out" | "completed";
  targetPrice: number;
  invalidPrice: number;
  volumeStatus: "verified" | "steady" | "weak";
  breakoutVolumeRatio: number;
  description: string;
  points: { index: number; price: number; label?: string }[];
  lines: {
    startIndex: number;
    startPrice: number;
    endIndex: number;
    endPrice: number;
    label: string;
    color: string;
    style?: "dashed" | "solid";
  }[];
};

type Pivot = {
  index: number;
  price: number;
  type: "high" | "low";
};

// Find local highs and lows within a rolling window of 4 candles
function findPivots(candles: Candle[], window = 4): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = window; i < candles.length - window; i++) {
    const c = candles[i]!;
    const slice = candles.slice(i - window, i + window + 1);
    const highs = slice.map((x) => x.high);
    const lows = slice.map((x) => x.low);

    const isHigh = c.high === Math.max(...highs);
    const isLow = c.low === Math.min(...lows);

    if (isHigh) {
      pivots.push({ index: i, price: c.high, type: "high" });
    } else if (isLow) {
      pivots.push({ index: i, price: c.low, type: "low" });
    }
  }
  return pivots;
}

// Compute volume verification ratio comparing breakout volume to consolidation average
function getVolumeRatio(candles: Candle[], startIdx: number, breakoutIdx: number): { ratio: number; status: "verified" | "steady" | "weak" } {
  if (breakoutIdx <= startIdx || breakoutIdx >= candles.length) {
    return { ratio: 1.0, status: "steady" };
  }
  const consolidationCandles = candles.slice(startIdx, breakoutIdx);
  const avgConsolidationVol = consolidationCandles.reduce((sum, c) => sum + c.volume, 0) / Math.max(1, consolidationCandles.length);
  const breakoutVol = candles[breakoutIdx]?.volume ?? avgConsolidationVol;
  const ratio = avgConsolidationVol === 0 ? 1.0 : breakoutVol / avgConsolidationVol;

  return {
    ratio,
    status: ratio >= 1.25 ? "verified" : ratio < 0.9 ? "weak" : "steady",
  };
}

export function detectPatterns(candles: Candle[]): DetectedPattern[] {
  if (candles.length < 25) return [];

  const pivots = findPivots(candles);
  const highs = pivots.filter((p) => p.type === "high");
  const lows = pivots.filter((p) => p.type === "low");
  const lastPrice = candles[candles.length - 1]?.close ?? 0;
  const lastIdx = candles.length - 1;
  const patterns: DetectedPattern[] = [];

  const genId = () => Math.random().toString(36).substring(2, 9);

  // Deduplication helper to prevent overlapping duplicate patterns of the same type
  const isDuplicate = (type: string, startIndex: number) => {
    return patterns.some(
      (p) => p.type === type && Math.abs((p.points[0]?.index ?? -999) - startIndex) < 6
    );
  };

  // ----------------------------------------------------
  // 1. REVERSAL PATTERNS
  // ----------------------------------------------------

  // Head and Shoulders (Bearish Reversal)
  if (highs.length >= 3) {
    for (let i = 0; i < highs.length - 2; i++) {
      const sh1 = highs[i]!;
      const head = highs[i + 1]!;
      const sh2 = highs[i + 2]!;

      if (head.price > sh1.price && head.price > sh2.price) {
        const shoulderDiff = Math.abs(sh1.price - sh2.price) / sh1.price;
        if (shoulderDiff <= 0.045 && !isDuplicate("head_shoulders", sh1.index)) {
          const intermediateLows = lows.filter((l) => l.index > sh1.index && l.index < sh2.index);
          if (intermediateLows.length >= 2) {
            const trough1 = intermediateLows[0]!;
            const trough2 = intermediateLows[1]!;

            const necklinePrice = (trough1.price + trough2.price) / 2;
            const headHeight = head.price - necklinePrice;
            const target = necklinePrice - headHeight;
            const stopLoss = sh2.price * 1.005; // SL above right shoulder

            const volInfo = getVolumeRatio(candles, sh1.index, lastIdx);

            patterns.push({
              id: genId(),
              name: "Head and Shoulders",
              category: "reversal",
              type: "head_shoulders",
              confidence: Math.round(92 - shoulderDiff * 250),
              status: lastPrice < necklinePrice ? "broken_out" : "forming",
              targetPrice: target,
              invalidPrice: stopLoss,
              volumeStatus: volInfo.status,
              breakoutVolumeRatio: Number(volInfo.ratio.toFixed(2)),
              description: `Bearish Head & Shoulders reversal. Neckline support lies at $${necklinePrice.toLocaleString()}. Breakout targets down-extension to $${target.toLocaleString()}, with stop-loss set just above the right shoulder at $${stopLoss.toLocaleString()}.`,
              points: [
                { index: sh1.index, price: sh1.price, label: "L Shoulder" },
                { index: head.index, price: head.price, label: "Head" },
                { index: sh2.index, price: sh2.price, label: "R Shoulder" },
                { index: trough1.index, price: trough1.price },
                { index: trough2.index, price: trough2.price },
              ],
              lines: [
                // Neckline
                {
                  startIndex: trough1.index,
                  startPrice: trough1.price,
                  endIndex: trough2.index,
                  endPrice: trough2.price,
                  label: "Neckline Support",
                  color: "var(--primary)",
                  style: "dashed",
                },
                // Left shoulder line
                {
                  startIndex: sh1.index - 2,
                  startPrice: sh1.price,
                  endIndex: sh1.index + 2,
                  endPrice: sh1.price,
                  label: "LS Height",
                  color: "var(--bear)",
                  style: "solid",
                },
                // Head line
                {
                  startIndex: head.index - 2,
                  startPrice: head.price,
                  endIndex: head.index + 2,
                  endPrice: head.price,
                  label: "Head Height",
                  color: "var(--bear)",
                  style: "solid",
                },
                // Right shoulder line
                {
                  startIndex: sh2.index - 2,
                  startPrice: sh2.price,
                  endIndex: sh2.index + 2,
                  endPrice: sh2.price,
                  label: "RS Height",
                  color: "var(--bear)",
                  style: "solid",
                },
                // Target projection
                {
                  startIndex: sh2.index,
                  startPrice: necklinePrice,
                  endIndex: lastIdx,
                  endPrice: target,
                  label: "Projection Target",
                  color: "var(--bear)",
                  style: "solid",
                },
              ],
            });
          }
        }
      }
    }
  }

  // Inverse Head and Shoulders (Bullish Reversal)
  if (lows.length >= 3) {
    for (let i = 0; i < lows.length - 2; i++) {
      const sh1 = lows[i]!;
      const head = lows[i + 1]!;
      const sh2 = lows[i + 2]!;

      if (head.price < sh1.price && head.price < sh2.price) {
        const shoulderDiff = Math.abs(sh1.price - sh2.price) / sh1.price;
        if (shoulderDiff <= 0.045 && !isDuplicate("inverse_head_shoulders", sh1.index)) {
          const intermediateHighs = highs.filter((h) => h.index > sh1.index && h.index < sh2.index);
          if (intermediateHighs.length >= 2) {
            const peak1 = intermediateHighs[0]!;
            const peak2 = intermediateHighs[1]!;

            const necklinePrice = (peak1.price + peak2.price) / 2;
            const headDepth = necklinePrice - head.price;
            const target = necklinePrice + headDepth;
            const stopLoss = sh2.price * 0.995; // SL below right shoulder

            const volInfo = getVolumeRatio(candles, sh1.index, lastIdx);

            patterns.push({
              id: genId(),
              name: "Inverse Head & Shoulders",
              category: "reversal",
              type: "inverse_head_shoulders",
              confidence: Math.round(92 - shoulderDiff * 250),
              status: lastPrice > necklinePrice ? "broken_out" : "forming",
              targetPrice: target,
              invalidPrice: stopLoss,
              volumeStatus: volInfo.status,
              breakoutVolumeRatio: Number(volInfo.ratio.toFixed(2)),
              description: `Bullish Inverse Head & Shoulders reversal. Neckline resistance lies at $${necklinePrice.toLocaleString()}. Breakout targets up-extension to $${target.toLocaleString()}, with stop-loss set just below the right shoulder at $${stopLoss.toLocaleString()}.`,
              points: [
                { index: sh1.index, price: sh1.price, label: "L Shoulder" },
                { index: head.index, price: head.price, label: "Head" },
                { index: sh2.index, price: sh2.price, label: "R Shoulder" },
                { index: peak1.index, price: peak1.price },
                { index: peak2.index, price: peak2.price },
              ],
              lines: [
                // Neckline
                {
                  startIndex: peak1.index,
                  startPrice: peak1.price,
                  endIndex: peak2.index,
                  endPrice: peak2.price,
                  label: "Neckline Resistance",
                  color: "var(--primary)",
                  style: "dashed",
                },
                // Left shoulder line
                {
                  startIndex: sh1.index - 2,
                  startPrice: sh1.price,
                  endIndex: sh1.index + 2,
                  endPrice: sh1.price,
                  label: "LS Base",
                  color: "var(--bull)",
                  style: "solid",
                },
                // Head line
                {
                  startIndex: head.index - 2,
                  startPrice: head.price,
                  endIndex: head.index + 2,
                  endPrice: head.price,
                  label: "Head Base",
                  color: "var(--bull)",
                  style: "solid",
                },
                // Right shoulder line
                {
                  startIndex: sh2.index - 2,
                  startPrice: sh2.price,
                  endIndex: sh2.index + 2,
                  endPrice: sh2.price,
                  label: "RS Base",
                  color: "var(--bull)",
                  style: "solid",
                },
                // Target projection
                {
                  startIndex: sh2.index,
                  startPrice: necklinePrice,
                  endIndex: lastIdx,
                  endPrice: target,
                  label: "Projection Target",
                  color: "var(--bull)",
                  style: "solid",
                },
              ],
            });
          }
        }
      }
    }
  }

  // Double Top (Bearish Reversal)
  if (highs.length >= 2) {
    for (let i = 0; i < highs.length - 1; i++) {
      const p1 = highs[i]!;
      const p2 = highs[i + 1]!;
      const dist = p2.index - p1.index;

      if (dist >= 5 && dist <= 25 && !isDuplicate("double_top", p1.index)) {
        const diffPct = Math.abs(p1.price - p2.price) / p1.price;
        if (diffPct <= 0.02) {
          const intermediate = candles.slice(p1.index, p2.index);
          const minLow = Math.min(...intermediate.map((c) => c.low));
          const troughIdx = p1.index + intermediate.findIndex((c) => c.low === minLow);

          const neckline = minLow;
          const target = neckline - (Math.max(p1.price, p2.price) - neckline);
          const stopLoss = Math.max(p1.price, p2.price) * 1.005; // SL above highest peak

          const volInfo = getVolumeRatio(candles, p1.index, lastIdx);

          patterns.push({
            id: genId(),
            name: "Double Top",
            category: "reversal",
            type: "double_top",
            confidence: Math.round(96 - diffPct * 800),
            status: lastPrice < neckline ? "broken_out" : "forming",
            targetPrice: target,
            invalidPrice: stopLoss,
            volumeStatus: volInfo.status,
            breakoutVolumeRatio: Number(volInfo.ratio.toFixed(2)),
            description: `Bearish Double Top showing equal high resistance ceiling at $${Math.max(p1.price, p2.price).toLocaleString()}. A break below the support neckline at $${neckline.toLocaleString()} targets $${target.toLocaleString()}, with stop-loss above the peaks.`,
            points: [
              { index: p1.index, price: p1.price, label: "Top 1" },
              { index: troughIdx, price: neckline, label: "Neckline" },
              { index: p2.index, price: p2.price, label: "Top 2" },
            ],
            lines: [
              // Support Neckline
              {
                startIndex: p1.index,
                startPrice: neckline,
                endIndex: p2.index,
                endPrice: neckline,
                label: "Support Neckline",
                color: "var(--primary)",
                style: "dashed",
              },
              // Resistance Ceiling
              {
                startIndex: p1.index,
                startPrice: (p1.price + p2.price) / 2,
                endIndex: p2.index,
                endPrice: (p1.price + p2.price) / 2,
                label: "Resistance Ceiling",
                color: "var(--bear)",
                style: "solid",
              },
              // Projection vector
              {
                startIndex: p2.index,
                startPrice: neckline,
                endIndex: lastIdx,
                endPrice: target,
                label: "Target Projection",
                color: "var(--bear)",
                style: "solid",
              },
            ],
          });
        }
      }
    }
  }

  // Double Bottom (Bullish Reversal)
  if (lows.length >= 2) {
    for (let i = 0; i < lows.length - 1; i++) {
      const p1 = lows[i]!;
      const p2 = lows[i + 1]!;
      const dist = p2.index - p1.index;

      if (dist >= 5 && dist <= 25 && !isDuplicate("double_bottom", p1.index)) {
        const diffPct = Math.abs(p1.price - p2.price) / p1.price;
        if (diffPct <= 0.02) {
          const intermediate = candles.slice(p1.index, p2.index);
          const maxHigh = Math.max(...intermediate.map((c) => c.high));
          const peakIdx = p1.index + intermediate.findIndex((c) => c.high === maxHigh);

          const neckline = maxHigh;
          const target = neckline + (neckline - Math.min(p1.price, p2.price));
          const stopLoss = Math.min(p1.price, p2.price) * 0.995; // SL below lowest trough

          const volInfo = getVolumeRatio(candles, p1.index, lastIdx);

          patterns.push({
            id: genId(),
            name: "Double Bottom",
            category: "reversal",
            type: "double_bottom",
            confidence: Math.round(96 - diffPct * 800),
            status: lastPrice > neckline ? "broken_out" : "forming",
            targetPrice: target,
            invalidPrice: stopLoss,
            volumeStatus: volInfo.status,
            breakoutVolumeRatio: Number(volInfo.ratio.toFixed(2)),
            description: `Bullish Double Bottom showing equal low support floor at $${Math.min(p1.price, p2.price).toLocaleString()}. A breakout above resistance neckline at $${neckline.toLocaleString()} targets $${target.toLocaleString()}, with stop-loss placed below wicks.`,
            points: [
              { index: p1.index, price: p1.price, label: "Bottom 1" },
              { index: peakIdx, price: neckline, label: "Neckline" },
              { index: p2.index, price: p2.price, label: "Bottom 2" },
            ],
            lines: [
              // Neckline Resistance
              {
                startIndex: p1.index,
                startPrice: neckline,
                endIndex: p2.index,
                endPrice: neckline,
                label: "Resistance Neckline",
                color: "var(--primary)",
                style: "dashed",
              },
              // Support Floor
              {
                startIndex: p1.index,
                startPrice: (p1.price + p2.price) / 2,
                endIndex: p2.index,
                endPrice: (p1.price + p2.price) / 2,
                label: "Support Floor",
                color: "var(--bull)",
                style: "solid",
              },
              // Projection vector
              {
                startIndex: p2.index,
                startPrice: neckline,
                endIndex: lastIdx,
                endPrice: target,
                label: "Target Projection",
                color: "var(--bull)",
                style: "solid",
              },
            ],
          });
        }
      }
    }
  }

  // ----------------------------------------------------
  // 2. BILATERAL PATTERNS (TRIANGLES)
  // ----------------------------------------------------
  if (highs.length >= 2 && lows.length >= 2) {
    const h1 = highs[highs.length - 2]!;
    const h2 = highs[highs.length - 1]!;
    const l1 = lows[lows.length - 2]!;
    const l2 = lows[lows.length - 1]!;

    const slopeHighs = (h2.price - h1.price) / (h2.index - h1.index);
    const slopeLows = (l2.price - l1.price) / (l2.index - l1.index);

    const isConverging = slopeHighs < 0 && slopeLows > 0;
    const isFlatTop = Math.abs(slopeHighs) / h1.price < 0.0035 && slopeLows > 0;
    const isFlatBottom = Math.abs(slopeLows) / l1.price < 0.0035 && slopeHighs < 0;

    const startIdx = Math.min(h1.index, l1.index);
    const endIdx = lastIdx;

    const getPriceAt = (pStart: Pivot, slope: number, idx: number) =>
      pStart.price + slope * (idx - pStart.index);

    if (isFlatTop && !isDuplicate("ascending_triangle", h1.index)) {
      const entryLvl = h1.price;
      const target = entryLvl + (entryLvl - l1.price);
      const stopLoss = l2.price * 0.995; // SL below rising support

      const volInfo = getVolumeRatio(candles, startIdx, lastIdx);

      patterns.push({
        id: genId(),
        name: "Ascending Triangle",
        category: "bilateral",
        type: "ascending_triangle",
        confidence: 87,
        status: lastPrice > entryLvl ? "broken_out" : "forming",
        targetPrice: target,
        invalidPrice: stopLoss,
        volumeStatus: volInfo.status,
        breakoutVolumeRatio: Number(volInfo.ratio.toFixed(2)),
        description: `Ascending Triangle. Flat resistance sits at $${entryLvl.toLocaleString()} with rising support trendline. Breakout targets $${target.toLocaleString()} with stop-loss placed outside the support boundary.`,
        points: [
          { index: h1.index, price: h1.price },
          { index: h2.index, price: h2.price },
          { index: l1.index, price: l1.price },
          { index: l2.index, price: l2.price },
        ],
        lines: [
          // Resistance
          {
            startIndex: startIdx,
            startPrice: entryLvl,
            endIndex: endIdx,
            endPrice: entryLvl,
            label: "Flat Resistance",
            color: "var(--bear)",
            style: "solid",
          },
          // Support
          {
            startIndex: l1.index,
            startPrice: l1.price,
            endIndex: endIdx,
            endPrice: getPriceAt(l1, slopeLows, endIdx),
            label: "Rising Support",
            color: "var(--bull)",
            style: "solid",
          },
          // Target vector
          {
            startIndex: h2.index,
            startPrice: entryLvl,
            endIndex: lastIdx,
            endPrice: target,
            label: "Projection Target",
            color: "var(--bull)",
            style: "dashed",
          },
        ],
      });
    }

    if (isFlatBottom && !isDuplicate("descending_triangle", l1.index)) {
      const entryLvl = l1.price;
      const target = entryLvl - (h1.price - entryLvl);
      const stopLoss = h2.price * 1.005; // SL above falling resistance

      const volInfo = getVolumeRatio(candles, startIdx, lastIdx);

      patterns.push({
        id: genId(),
        name: "Descending Triangle",
        category: "bilateral",
        type: "descending_triangle",
        confidence: 87,
        status: lastPrice < entryLvl ? "broken_out" : "forming",
        targetPrice: target,
        invalidPrice: stopLoss,
        volumeStatus: volInfo.status,
        breakoutVolumeRatio: Number(volInfo.ratio.toFixed(2)),
        description: `Descending Triangle. Flat support sits at $${entryLvl.toLocaleString()} with falling resistance trendline. Breakdown targets $${target.toLocaleString()} with stop-loss placed outside the resistance boundary.`,
        points: [
          { index: h1.index, price: h1.price },
          { index: h2.index, price: h2.price },
          { index: l1.index, price: l1.price },
          { index: l2.index, price: l2.price },
        ],
        lines: [
          // Support
          {
            startIndex: startIdx,
            startPrice: entryLvl,
            endIndex: endIdx,
            endPrice: entryLvl,
            label: "Flat Support",
            color: "var(--bull)",
            style: "solid",
          },
          // Resistance
          {
            startIndex: h1.index,
            startPrice: h1.price,
            endIndex: endIdx,
            endPrice: getPriceAt(h1, slopeHighs, endIdx),
            label: "Falling Resistance",
            color: "var(--bear)",
            style: "solid",
          },
          // Target vector
          {
            startIndex: l2.index,
            startPrice: entryLvl,
            endIndex: lastIdx,
            endPrice: target,
            label: "Projection Target",
            color: "var(--bear)",
            style: "dashed",
          },
        ],
      });
    }

    if (isConverging && !isDuplicate("symmetrical_triangle", h1.index)) {
      const isBullBreak = lastPrice > getPriceAt(h1, slopeHighs, lastIdx);
      const target = lastPrice * (isBullBreak ? 1.055 : 0.945);
      const stopLoss = isBullBreak ? l2.price * 0.995 : h2.price * 1.005; // SL outside opposite side

      const volInfo = getVolumeRatio(candles, startIdx, lastIdx);

      patterns.push({
        id: genId(),
        name: "Symmetrical Triangle",
        category: "bilateral",
        type: "symmetrical_triangle",
        confidence: 89,
        status: isBullBreak || lastPrice < getPriceAt(l1, slopeLows, lastIdx) ? "broken_out" : "forming",
        targetPrice: target,
        invalidPrice: stopLoss,
        volumeStatus: volInfo.status,
        breakoutVolumeRatio: Number(volInfo.ratio.toFixed(2)),
        description: `Symmetrical Triangle with converging upper and lower boundaries. Highly bilateral; breakout targets $${target.toLocaleString()} with stop-loss placed outside the opposite side of the triangle.`,
        points: [
          { index: h1.index, price: h1.price },
          { index: h2.index, price: h2.price },
          { index: l1.index, price: l1.price },
          { index: l2.index, price: l2.price },
        ],
        lines: [
          // Resistance
          {
            startIndex: h1.index,
            startPrice: h1.price,
            endIndex: endIdx,
            endPrice: getPriceAt(h1, slopeHighs, endIdx),
            label: "Resistance",
            color: "var(--bear)",
            style: "solid",
          },
          // Support
          {
            startIndex: l1.index,
            startPrice: l1.price,
            endIndex: endIdx,
            endPrice: getPriceAt(l1, slopeLows, endIdx),
            label: "Support",
            color: "var(--bull)",
            style: "solid",
          },
          // Target vector
          {
            startIndex: h2.index,
            startPrice: getPriceAt(h1, slopeHighs, h2.index),
            endIndex: lastIdx,
            endPrice: target,
            label: "Projection Target",
            color: isBullBreak ? "var(--bull)" : "var(--bear)",
            style: "dashed",
          },
        ],
      });
    }
  }

  // ----------------------------------------------------
  // 3. CONTINUATION PATTERNS (FLAGS & PENNANTS)
  // ----------------------------------------------------
  const isBullTrend = lastPrice > candles[lastIdx - 18]?.close!;
  const poleStart = lastIdx - 15;
  const consolidationStart = lastIdx - 8;

  if (consolidationStart > poleStart && !isDuplicate(isBullTrend ? "bull_flag" : "bear_flag", poleStart)) {
    const channelLow = Math.min(...candles.slice(consolidationStart, lastIdx).map((c) => c.low));
    const channelHigh = Math.max(...candles.slice(consolidationStart, lastIdx).map((c) => c.high));

    if (isBullTrend) {
      const target = lastPrice * 1.05;
      const stopLoss = channelLow * 0.995; // SL below lowest point of flag channel

      const volInfo = getVolumeRatio(candles, consolidationStart, lastIdx);

      patterns.push({
        id: genId(),
        name: "Bull Flag",
        category: "continuation",
        type: "bull_flag",
        confidence: 85,
        status: "forming",
        targetPrice: target,
        invalidPrice: stopLoss,
        volumeStatus: volInfo.status,
        breakoutVolumeRatio: Number(volInfo.ratio.toFixed(2)),
        description: `Bull Flag continuation pattern. The consolidation channel slants slightly downward after a strong vertical flagpole. A breakout above resistance targets $${target.toLocaleString()} with stop-loss below the channel floor at $${stopLoss.toLocaleString()}.`,
        points: [
          { index: poleStart, price: candles[poleStart]?.low!, label: "Pole Start" },
          { index: consolidationStart, price: channelHigh, label: "Flag top" },
        ],
        lines: [
          // Flagpole
          {
            startIndex: poleStart,
            startPrice: candles[poleStart]?.low!,
            endIndex: consolidationStart,
            endPrice: channelHigh,
            label: "Impulse Pole",
            color: "var(--primary)",
            style: "solid",
          },
          // Channel Resistance
          {
            startIndex: consolidationStart,
            startPrice: channelHigh,
            endIndex: lastIdx,
            endPrice: channelHigh * 0.99,
            label: "Channel Resistance",
            color: "var(--bear)",
            style: "solid",
          },
          // Channel Support
          {
            startIndex: consolidationStart,
            startPrice: channelLow,
            endIndex: lastIdx,
            endPrice: channelLow * 0.99,
            label: "Channel Support",
            color: "var(--bull)",
            style: "solid",
          },
          // Target vector
          {
            startIndex: consolidationStart,
            startPrice: channelHigh,
            endIndex: lastIdx,
            endPrice: target,
            label: "Target Projection",
            color: "var(--bull)",
            style: "dashed",
          },
        ],
      });
    } else {
      const target = lastPrice * 0.95;
      const stopLoss = channelHigh * 1.005; // SL above highest point of bear flag channel

      const volInfo = getVolumeRatio(candles, consolidationStart, lastIdx);

      patterns.push({
        id: genId(),
        name: "Bear Flag",
        category: "continuation",
        type: "bear_flag",
        confidence: 84,
        status: "forming",
        targetPrice: target,
        invalidPrice: stopLoss,
        volumeStatus: volInfo.status,
        breakoutVolumeRatio: Number(volInfo.ratio.toFixed(2)),
        description: `Bear Flag continuation pattern. The consolidation channel slants slightly upward after a sharp vertical decline. A breakdown below support targets $${target.toLocaleString()} with stop-loss above the channel ceiling at $${stopLoss.toLocaleString()}.`,
        points: [
          { index: poleStart, price: candles[poleStart]?.high!, label: "Pole Start" },
          { index: consolidationStart, price: channelLow, label: "Flag base" },
        ],
        lines: [
          // Flagpole
          {
            startIndex: poleStart,
            startPrice: candles[poleStart]?.high!,
            endIndex: consolidationStart,
            endPrice: channelLow,
            label: "Impulse Pole",
            color: "var(--primary)",
            style: "solid",
          },
          // Channel Resistance
          {
            startIndex: consolidationStart,
            startPrice: channelHigh,
            endIndex: lastIdx,
            endPrice: channelHigh * 1.01,
            label: "Channel Resistance",
            color: "var(--bear)",
            style: "solid",
          },
          // Channel Support
          {
            startIndex: consolidationStart,
            startPrice: channelLow,
            endIndex: lastIdx,
            endPrice: channelLow * 1.01,
            label: "Channel Support",
            color: "var(--bull)",
            style: "solid",
          },
          // Target vector
          {
            startIndex: consolidationStart,
            startPrice: channelLow,
            endIndex: lastIdx,
            endPrice: target,
            label: "Target Projection",
            color: "var(--bear)",
            style: "dashed",
          },
        ],
      });
    }
  }

  return patterns;
}
