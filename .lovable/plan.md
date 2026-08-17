# Fix Pattern Charts (blank / failing renders)

## What's wrong

The pattern mini-charts are drawn with the `lightweight-charts` library, and the installed version is 5.2.0. That version removed every drawing method the code calls (`addCandlestickSeries`, `addLineSeries`, `setMarkers`), so chart creation throws immediately. The failure is caught inside the component, so you get a blank/placeholder card instead of a chart and nothing useful surfaces.

## Fix approach

Drop the third-party chart library for pattern rendering and draw the pattern charts with a self-contained SVG renderer — the same free, dependency-free technique already used by the main price chart in this app. This removes version-API risk entirely, renders identically on server and client, and gives exact pixel control over the pattern geometry.

## What the new pattern chart will show

- Candlesticks (bull/bear colored) scaled to the visible price range, with padding so overlays never clip.
- Pattern trendlines drawn exactly between the detected candle indices (neckline, support/resistance, wedge/triangle boundaries), solid or dashed per the pattern definition, in bull/bear/neutral theme colors.
- Pattern point markers (tops, bottoms, shoulders) as small triangles/dots with short labels, placed above or below the candle.
- Horizontal target and invalidation lines with right-edge labels.
- Light price axis ticks and time labels at each end, matching the app's terminal styling.
- Hover tooltip showing OHLC for the hovered candle, with a compact readable layout on mobile.
- Two sizes: compact for the dashboard grid, taller for the fullscreen dialog.
- "Save Chart PNG" preserved by rasterizing the SVG to a canvas in the browser.

## Accuracy notes

- Candle indices from the detector map straight to x positions, so lines land on the exact candles that formed the pattern (no time-based dedupe/sort quirks the old library required).
- Zero-width lines and duplicate markers are clamped rather than silently dropped, so single-candle features still render.
- Price scaling accounts for target and invalidation levels when they are near the visible range, so overlays stay in frame.

## Technical details

- Rewrite `src/components/signal/PatternChart.tsx` as a pure SVG component; remove the dynamic `lightweight-charts` import and the error-box fallback path.
- Reuse formatting helpers from `src/components/signal/format.ts`; colors come from existing semantic tokens (`--bull`, `--bear`, `--primary`, border/muted) rather than hardcoded hex.
- No changes needed to `src/lib/patterns.ts` (detector output already provides `points`, `lines`, `targetPrice`, `invalidPrice`) or to `PatternDashboard.tsx`.
- Remove the now-unused `lightweight-charts` dependency if nothing else imports it.
- Verify by driving the live preview: run an analysis, confirm pattern cards render candles plus overlay lines, and check the console is clean.

## Pre-existing type errors to clear in the same pass

The project currently fails typecheck on unrelated files; these will be fixed too so the build is green:

- `fillTime` optional-vs-required mismatch in `src/lib/tracker-types.ts` / `tracker.server.ts` / `tracker.functions.ts` / `useTradeTracker.tsx`.
- `process.env.DATABASE_URL` index-signature access in `src/lib/db/index.ts`.
- Possibly-undefined `p.points[0]` access at `src/lib/patterns.ts:100`.
