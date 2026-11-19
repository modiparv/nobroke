import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { PlanResult } from "../lib/types";
import { formatINR } from "../lib/format";
import { estimateTextWidth, niceTicks, shareLabel, yearTicks } from "../lib/goalPaths";
import { C } from "../lib/theme";

/**
 * The width a chart has to draw in, in real pixels. Charts draw at 1:1
 * instead of scaling a fixed viewBox, so a 12px tick is 12px on a 360px
 * phone and on a desktop card alike.
 */
export function useChartWidth<T extends HTMLElement>(fallback = 640) {
  // The element is kept in state, so the width is read again whenever the
  // chart's box is mounted afresh.
  const [el, ref] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    if (!el) return;
    const read = () => {
      const next = Math.round(el.clientWidth);
      if (next > 0) setWidth((w) => (w === next ? w : next));
    };
    read();
    const watcher = new ResizeObserver(read);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [el]);
  return [ref, width] as const;
}

/**
 * Measures text as the page will draw it, so chart labels can be laid out
 * before they are painted. Sizes are given in rem and follow the person's
 * own text-size setting; widths are re-read once the web font has loaded.
 */
export function useTextMeasure() {
  const [fontsLoaded, setFontsLoaded] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return;
    let live = true;
    const bump = () => {
      if (live) setFontsLoaded((n) => n + 1);
    };
    fonts.ready.then(bump);
    fonts.addEventListener?.("loadingdone", bump);
    return () => {
      live = false;
      fonts.removeEventListener?.("loadingdone", bump);
    };
  }, []);
  return useMemo(() => {
    const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";
    const rootPx = inBrowser ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;
    const family = inBrowser ? getComputedStyle(document.body).fontFamily : "sans-serif";
    const ctx = inBrowser ? document.createElement("canvas").getContext("2d") : null;
    const measure = (text: string, rem: number, weight = 400): number => {
      const px = rem * rootPx;
      if (!ctx) return estimateTextWidth(text, px);
      ctx.font = `${weight} ${px}px ${family}`;
      return ctx.measureText(text).width;
    };
    return { measure, rootPx };
    // fontsLoaded is the trigger: the same text is wider or narrower once Manrope arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsLoaded]);
}

const TICK_REM = 0.75;
const LABEL_REM = 0.875;

/** A legend key drawn like the line it stands for. */
function Key({ stroke, dash, width = 2 }: { stroke: string; dash?: string; width?: number }) {
  return (
    <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden className="flex-none">
      <line x1="1" y1="4" x2="17" y2="4" stroke={stroke} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
}

/**
 * One goal's money over time, in the same rupees as the figures around it:
 * what it grows to, what was put in, and the amount the goal needs.
 */
export default function Chart({ r }: { r: PlanResult }) {
  const [ref, width] = useChartWidth<HTMLDivElement>(640);
  const { measure, rootPx } = useTextMeasure();
  const narrow = width < 480;
  const H = 200;
  const tickPx = TICK_REM * rootPx;
  const maxX = Math.max(1, r.months);

  // Scale to your money's own path so the curve is always readable. If the goal
  // is far above the projection, say so rather than squashing the curve.
  const peak = Math.max(r.projectedCorpus, r.totalInvested, 1);
  const goalInView = r.requiredCorpus <= peak * 1.6;
  const maxY = (goalInView ? Math.max(peak, r.requiredCorpus) : peak) * 1.2;
  // With no money in and none projected, the value axis stays blank rather
  // than reading ₹0 / ₹1 / ₹1.
  const hasValues = r.projectedCorpus > 0 || r.totalInvested > 0;

  const yTicks = hasValues ? [0, ...niceTicks(maxY, 4)] : [];
  const yTickText = yTicks.map((v) => formatINR(v));
  // Calendar years along the bottom, whole years only.
  const baseYear = new Date().getFullYear();
  const xTicks = yearTicks(baseYear, maxX / 12, narrow ? 6 : 8);
  const endYear = baseYear + Math.round(maxX / 12);
  const PAD = {
    t: 12,
    // Room for the end dot and half of the last year's label.
    r: Math.max(18, Math.ceil(measure(String(endYear), TICK_REM) / 2) + 3),
    // Room for the year ticks, set clear of the ₹0 tick beside them.
    b: Math.round(tickPx * 1.3) + 16,
    // Room for the value ticks, or at least for half of the first year.
    l: Math.max(22, Math.ceil(Math.max(0, ...yTickText.map((t) => measure(t, TICK_REM)))) + 14),
  };
  const PW = Math.max(40, width - PAD.l - PAD.r);
  const PH = H - PAD.t - PAD.b;

  const x = (m: number) => PAD.l + (m / maxX) * PW;
  const y = (v: number) => PAD.t + PH - (Math.min(Math.max(v, 0), maxY) / maxY) * PH;

  const pts = r.series;
  const valuePath = pts.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const investedPath = pts.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(1)},${y(p.invested).toFixed(1)}`).join(" ");
  const base = (PAD.t + PH).toFixed(1);
  const area = `${valuePath} L${x(maxX).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;

  const ty = y(r.requiredCorpus);
  // The word "Goal" sits just above its line at the left, where the money is
  // usually still low. If the money already starts there, it sits just below.
  const labelPx = LABEL_REM * rootPx;
  const y0 = y(pts[0]?.value ?? 0);
  const goalBelow = y0 <= ty && y0 > ty - labelPx * 2;
  const surface = "rgb(var(--surface))";
  const halo = { paintOrder: "stroke", stroke: surface, strokeWidth: 4, strokeLinejoin: "round" } as const;

  return (
    <div className="mt-3">
      <div ref={ref} className="w-full min-w-0">
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Your money grows to about ${formatINR(r.projectedCorpus)} by ${endYear}. You will have put in ${formatINR(r.totalInvested)}. The goal needs ${formatINR(r.requiredCorpus)}.`}
        >
          {yTicks.map((v, i) => (
            <g key={v}>
              <line x1={PAD.l} y1={y(v)} x2={PAD.l + PW} y2={y(v)} stroke={v === 0 ? "rgb(var(--line-2))" : C.line} strokeWidth="1" />
              <text x={PAD.l - 10} y={y(v)} dy="0.35em" textAnchor="end" fill={C.muted} className="num" style={{ fontSize: `${TICK_REM}rem` }}>
                {yTickText[i]}
              </text>
            </g>
          ))}
          {!hasValues && <line x1={PAD.l} y1={y(0)} x2={PAD.l + PW} y2={y(0)} stroke="rgb(var(--line-2))" strokeWidth="1" />}
          {xTicks.map((t) => (
            <text
              key={t.year}
              x={x(t.offset * 12)}
              y={PAD.t + PH + 13 + tickPx * 0.8}
              textAnchor="middle"
              fill={C.muted}
              className="num"
              style={{ fontSize: `${TICK_REM}rem` }}
            >
              {t.year}
            </text>
          ))}

          <path d={area} fill={C.brand} opacity="0.06" />
          <path d={investedPath} fill="none" stroke={C.invested} strokeWidth="2" strokeDasharray="5 5" />
          <path d={valuePath} fill="none" stroke={C.brand} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {!hasValues ? (
            <text x={PAD.l + PW / 2} y={PAD.t + PH / 2} textAnchor="middle" fill={C.muted} style={{ fontSize: `${LABEL_REM}rem` }}>
              No money in this goal yet
            </text>
          ) : goalInView ? (
            <>
              <line x1={PAD.l} y1={ty} x2={PAD.l + PW} y2={ty} stroke={C.ink} strokeWidth="1.5" strokeDasharray="1 5" strokeLinecap="round" />
              <text
                x={PAD.l + 8}
                y={goalBelow ? ty + 8 + labelPx * 0.75 : ty - 8}
                fill={C.ink}
                className="font-medium"
                style={{ fontSize: `${LABEL_REM}rem`, ...halo }}
              >
                Goal
              </text>
            </>
          ) : (
            <text
              x={PAD.l + PW}
              y={PAD.t + labelPx * 0.8}
              textAnchor="end"
              fill={C.ink}
              className="font-medium"
              style={{ fontSize: `${LABEL_REM}rem`, ...halo }}
            >
              The goal is above this chart
            </text>
          )}

          <circle cx={x(0)} cy={y(pts[0]?.value ?? 0)} r="3.5" fill={C.brand} />
          <circle cx={x(maxX)} cy={y(r.projectedCorpus)} r="5.5" fill={C.brand} stroke={surface} strokeWidth="2" />
        </svg>
      </div>

      {/* All the numbers live here, so the chart itself stays uncluttered.
          Each key is drawn like its line. */}
      <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-support text-text-2">
        <li className="inline-flex items-center gap-2 whitespace-nowrap">
          <Key stroke={C.brand} width={2.5} />
          Your money
          <span className="num font-medium text-text">{formatINR(r.projectedCorpus)}</span>
        </li>
        <li className="inline-flex items-center gap-2 whitespace-nowrap">
          <Key stroke={C.invested} dash="4 4" />
          Put in
          <span className="num text-text">{formatINR(r.totalInvested)}</span>
        </li>
        <li className="inline-flex items-center gap-2 whitespace-nowrap">
          <Key stroke={C.ink} dash="1 5" width={1.5} />
          Goal
          <span className="num font-medium text-text">{formatINR(r.requiredCorpus)}</span>
        </li>
        <li className="num whitespace-nowrap font-medium text-text sm:ml-auto">{shareLabel(r.progress)} of the goal</li>
      </ul>
    </div>
  );
}
