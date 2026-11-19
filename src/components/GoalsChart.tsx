import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { blendedReturn, computePlan, projectionSeries, requiredCorpus } from "../lib/finance";
import { GAP_LABEL, gapLevel } from "../lib/gap";
import { inr } from "../lib/glue";
import { SHARE_CAP, niceTicks, placeLabels, shareAxis, shareLabel, sharePath, shortName, yearTicks, type Box } from "../lib/goalPaths";
import { goalsByPriority, planInputsForGoal, useStore } from "../store";
import { sectionLabel } from "../ui";
import { useChartWidth, useTextMeasure } from "./Chart";
import StatusPill from "./StatusPill";

/**
 * Every goal on one chart, computed with exactly the same inputs the Plan
 * tab uses (each goal's share of capital and of the monthly amount, growing
 * at the shared mix's blended return).
 *
 * Two views of the same projection:
 *  - Share of goal (the default): each line is how much of THAT goal's cost
 *    the money covers in each year, so a ₹10 L goal and a ₹10 Cr goal are
 *    equally readable. A line that reaches the 100% rule is fully covered.
 *  - Rupees: every goal on one rupee axis, in the rupees of each year, with
 *    a ring on each line at what that goal needs by its date.
 */

// Two palettes for two grounds: paper cards and the night band.
const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
const NIGHT_PALETTE = ["var(--chartn-1)", "var(--chartn-2)", "var(--chartn-3)", "var(--chartn-4)", "var(--chartn-5)", "var(--chartn-6)"];

type View = "share" | "rupees";
const VIEWS: Array<{ id: View; label: string }> = [
  { id: "share", label: "Share of goal" },
  { id: "rupees", label: "Rupees" },
];

// Axis ticks are 12px. Everything a person reads as words is 14px.
const TICK_REM = 0.75;
const NAME_REM = 0.875;
const CAPTION_REM = 0.875;
/** The dot at a line's end, and the clear space a name keeps from it. */
const DOT = 4.5;
const MARKER = DOT + 1;
const GAP = 4;
const ZONE_CAPTION = "Goal fully covered";

/** A legend key drawn like the line it stands for. */
function LineKey({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width="16" height="24" viewBox="0 0 16 24" aria-hidden className="flex-none">
      <line x1="1.5" y1="12" x2="14.5" y2="12" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  );
}

/** An amount that never breaks from its unit ("₹9.33" on one line, "Cr" on the next). */
const rupees = inr;

export default function GoalsChart({ variant = "card" }: { variant?: "card" | "night" }) {
  const s = useStore();
  const [view, setView] = useState<View>("share");
  // The year under the pointer or finger, as whole years from today.
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useChartWidth<HTMLDivElement>(640);
  const svgRef = useRef<SVGSVGElement>(null);
  const { measure, rootPx } = useTextMeasure();

  // A touch leaves the readout up; touching anywhere else puts it away.
  const reading = hover !== null;
  useEffect(() => {
    if (!reading) return;
    const away = (e: PointerEvent) => {
      if (!svgRef.current?.contains(e.target as Node)) setHover(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [reading]);

  const night = variant === "night";
  const baseYear = new Date().getFullYear();
  // Each goal's projection, from the same functions the Plan tab uses. Kept
  // between renders, so moving the pointer over the chart does not redo it.
  const series = useMemo(() => {
    const palette = night ? NIGHT_PALETTE : PALETTE;
    const ret = blendedReturn(s.portfolio);
    return goalsByPriority(s).map((g, i) => {
      const inputs = planInputsForGoal(s, g);
      const points = projectionSeries(inputs, ret);
      const shares = sharePath(points, g.targetToday, s.inflation);
      return {
        goal: g,
        color: palette[i % palette.length],
        // Past the palette's end the colours come round again, dashed, so a
        // seventh goal is not mistaken for the first.
        dash: i >= palette.length ? "6 5" : undefined,
        points,
        shares,
        need: requiredCorpus(g.targetToday, s.inflation, g.horizonYears),
        projected: points[points.length - 1]?.value ?? 0,
        endShare: shares[shares.length - 1]?.share ?? 0,
        endYear: baseYear + g.horizonYears,
        level: gapLevel(computePlan(inputs)),
      };
    });
  }, [s, night, baseYear]);
  type Series = (typeof series)[number];
  const goals = series.map((sr) => sr.goal);
  const tone = night
    ? {
        grid: "rgb(var(--on-night-3) / 0.3)",
        base: "rgb(var(--on-night-3))",
        rule: "rgb(var(--on-night-2))",
        zone: "rgb(var(--on-night) / 0.06)",
        tick: "rgb(var(--on-night-2))",
        ink: "rgb(var(--on-night))",
        ground: "rgb(var(--night))",
        title: "text-support font-medium text-on-night",
        aside: "text-support text-on-night-2",
        name: "text-support text-on-night",
        toggle: "bg-on-night/10",
        on: "bg-on-night text-night",
        off: "text-on-night-2 hover:text-on-night",
        focus: "focus-visible:outline-on-night",
        tip: "border-on-night-3 bg-night text-on-night",
      }
    : {
        grid: "rgb(var(--line))",
        base: "rgb(var(--line-2))",
        rule: "rgb(var(--text-2))",
        zone: "rgb(var(--surface-2) / 0.7)",
        tick: "rgb(var(--text-2))",
        ink: "rgb(var(--text))",
        ground: "rgb(var(--surface))",
        title: sectionLabel,
        aside: "text-support text-text-2",
        name: "text-support text-text",
        toggle: "bg-surface-2",
        on: "bg-accent-fill text-on-accent",
        off: "text-text-2 hover:text-text",
        focus: "",
        tip: "border-line-2 bg-surface text-text",
      };
  if (goals.length === 0) return null;

  // The drawing space, in real pixels: text is laid out at its true size.
  const narrow = width < 480;
  const H = 280;
  const tickPx = TICK_REM * rootPx;
  const nameH = Math.round(NAME_REM * rootPx * 1.3);
  const captionH = Math.round(CAPTION_REM * rootPx * 1.3);
  const top = 8;
  const bottom = Math.round(tickPx * 1.3) + 14;
  const plotH = H - top - bottom;

  // The time axis hugs the real horizons (2-year floor only), so short-dated
  // plans fill the width instead of huddling in the left half.
  const maxYears = Math.max(2, ...goals.map((g) => g.horizonYears));

  // The value axis. Share view: 0% at the bottom, the 100% rule, and above
  // it a zone tall enough for its caption and one row of goal names.
  const zonePx = captionH + nameH + MARKER + GAP + 8;
  const axis = shareAxis(Math.max(0, ...series.flatMap((sr) => sr.shares.map((p) => p.share))), 1 / (1 - zonePx / plotH));
  const peak = Math.max(0, ...series.flatMap((sr) => [sr.need, sr.projected]));
  // With nothing to plot, the rupee axis stays blank rather than reading ₹0 / ₹1 / ₹1.
  const hasValues = peak > 0;
  const maxValue = hasValues ? peak * 1.08 : 1;
  const share = view === "share";
  const ticks = share
    ? axis.ticks.map((t) => ({ at: t / axis.top, text: `${Math.round(t * 100)}%${axis.capped && t === SHARE_CAP ? "+" : ""}`, strong: t === 1 }))
    : [0, ...(hasValues ? niceTicks(maxValue, narrow ? 4 : 5) : [])].map((v) => ({ at: v / maxValue, text: rupees(v), strong: false }));

  const left = Math.ceil(Math.max(0, ...ticks.map((t) => measure(t.text, TICK_REM)))) + 14;
  const years = yearTicks(baseYear, maxYears, narrow ? 6 : 8);
  // Room on the right for the end dot and half of the last year's label.
  const right = Math.max(18, Math.ceil(measure(String(baseYear + maxYears), TICK_REM) / 2) + 3);
  const plotW = Math.max(40, width - left - right);
  const x = (year: number) => left + (year / maxYears) * plotW;
  /** A height from 0 (the baseline) to 1 (the top edge of the plot). */
  const yAt = (f: number) => top + plotH * (1 - Math.min(Math.max(f, 0), 1));
  const yShare = (v: number) => yAt(Math.min(v, axis.capped ? SHARE_CAP : axis.top) / axis.top);
  const yRupee = (v: number) => yAt(v / maxValue);
  const y100 = yShare(1);

  const lines = series.map((sr) =>
    share ? sr.shares.map((p) => ({ x: x(p.year), y: yShare(p.share) })) : sr.points.map((p) => ({ x: x(p.year), y: yRupee(p.value) })),
  );
  const ends = lines.map((line) => line[line.length - 1] ?? { x: x(0), y: yAt(0) });
  // Rupee view: what each goal needs by its date, joined to its line's end.
  const needs = series.map((sr, i) => ({ x: ends[i].x, y: yRupee(sr.need) }));

  // Names at the line ends, laid out so no two collide (lib/goalPaths).
  const zoneCaption: Box = { x: left + 8, y: top + 4, w: Math.ceil(measure(ZONE_CAPTION, CAPTION_REM)), h: captionH };
  const tickBoxes: Box[] = ticks.map((t) => {
    const w = measure(t.text, TICK_REM);
    return { x: left - 10 - w, y: yAt(t.at) - tickPx / 2, w, h: tickPx };
  });
  const labels = placeLabels(
    series.map((sr, i) => ({
      id: sr.goal.id,
      x: ends[i].x,
      y: ends[i].y,
      w: Math.ceil(measure(shortName(sr.goal.name), NAME_REM, 500)) + 2,
      // In rupees the line ends huddle near the baseline, so a name may sit
      // beside its goal's ring instead.
      alt: share ? undefined : [needs[i]],
    })),
    {
      bounds: { x: 2, y: 2, w: width - 4, h: top + plotH - 4 },
      h: nameH,
      gap: GAP,
      marker: MARKER,
      obstacles: share ? [...tickBoxes, zoneCaption] : tickBoxes,
      lines: share ? lines : [...lines, ...needs.map((n, i) => [ends[i], n])],
      rules: share ? [y100] : [],
      // With many goals the names keep to clear ground; the key names the rest.
      maxCost: series.length > 4 ? 4 : undefined,
    },
  );
  const halo = { paintOrder: "stroke", stroke: tone.ground, strokeWidth: 4, strokeLinejoin: "round" } as const;

  const figure = (sr: Series) =>
    share ? `${shareLabel(sr.endShare)} by ${sr.endYear}` : `${rupees(sr.projected)} of ${rupees(sr.need)} by ${sr.endYear}`;
  const summary = series.map((sr) => `${sr.goal.name}: ${figure(sr)}, ${GAP_LABEL[sr.level].toLowerCase()}.`).join(" ");

  // The readout: every goal's figure in the year under the pointer.
  const lastYear = Math.max(...goals.map((g) => g.horizonYears));
  const pick = (e: ReactPointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - box.left) * (width / Math.max(1, box.width));
    if (px < left - 12 || px > left + plotW + 12) return setHover(null);
    const year = Math.round(((px - left) / plotW) * maxYears);
    setHover(Math.min(Math.max(year, 0), lastYear));
  };
  const readout =
    hover === null
      ? []
      : series.flatMap((sr, i) => {
          // Points are monthly, so a whole year is every twelfth one.
          const p = share ? sr.shares[hover * 12] : sr.points[hover * 12];
          if (!p) return [];
          const at = lines[i][hover * 12];
          const text = "share" in p ? shareLabel(p.share) : rupees(p.value);
          return [{ sr, at, text }];
        });
  // Its width is worked out before it is drawn, so it can be kept inside the
  // chart: padding and border, the line key, the longest name, the longest figure.
  const tipW = Math.min(
    width - 8,
    Math.ceil(
      26 + 24 + Math.max(0, ...readout.map((row) => measure(row.sr.goal.name, NAME_REM))) + 14 + Math.max(0, ...readout.map((row) => measure(row.text, NAME_REM, 500))),
    ),
  );
  const hoverX = hover === null ? 0 : x(hover);
  const tipLeft = hoverX + 12 + tipW <= width ? hoverX + 12 : hoverX - 12 - tipW >= 0 ? hoverX - 12 - tipW : Math.max(0, width - tipW);

  const Wrapper = night ? "div" : "section";
  return (
    <Wrapper className={night ? "" : "rounded-card border border-line bg-surface p-4 sm:p-5"}>
      {/* Title, the two-way switch, and one sentence on what is plotted. On a
          phone they stack in that order; wider, the switch sits to the right. */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <h2 className={tone.title}>Where your goals are headed</h2>
        <div
          className={`inline-flex items-center gap-0.5 justify-self-start rounded-full p-0.5 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-start ${tone.toggle}`}
          role="group"
          aria-label="Show each goal as"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              aria-pressed={view === v.id}
              className={`inline-flex h-11 items-center whitespace-nowrap rounded-full px-4 text-support transition-colors motion-reduce:transition-none ${tone.focus} ${
                view === v.id ? tone.on : tone.off
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className={`max-w-prose ${tone.aside}`}>
          {share
            ? "How much of each goal's cost your money covers in each year, if you keep going like this. Rising prices are included."
            : "What each goal's money grows to if you keep going like this, in the rupees of that year. The ring is what the goal will cost by then."}
        </p>
      </div>

      <div ref={ref} className="relative mt-3 w-full min-w-0">
        <svg
          ref={svgRef}
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          className="block h-auto w-full touch-pan-y select-none"
          role="img"
          aria-label={`${share ? "Share of each goal covered, by year." : "Each goal's money in rupees, by year."} ${summary}`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHover(null);
          }}
        >
          {/* The zone above 100%: a goal whose line ends in it is covered. */}
          {share && <rect x={left} y={top} width={plotW} height={Math.max(0, y100 - top)} fill={tone.zone} />}

          {/* Grid and value ticks */}
          {ticks.map((t) => {
            const ty = yAt(t.at);
            return (
              <g key={t.text}>
                <line
                  x1={left}
                  x2={left + plotW}
                  y1={ty}
                  y2={ty}
                  stroke={t.strong ? tone.rule : t.at === 0 ? tone.base : tone.grid}
                  strokeWidth={t.strong ? 1.5 : 1}
                />
                <text
                  x={left - 10}
                  y={ty}
                  dy="0.35em"
                  textAnchor="end"
                  fill={t.strong ? tone.ink : tone.tick}
                  className={t.strong ? "num font-medium" : "num"}
                  style={{ fontSize: `${TICK_REM}rem` }}
                >
                  {t.text}
                </text>
              </g>
            );
          })}
          {share && (
            <text x={zoneCaption.x} y={zoneCaption.y + captionH / 2} dy="0.35em" fill={tone.tick} style={{ fontSize: `${CAPTION_REM}rem` }}>
              {ZONE_CAPTION}
            </text>
          )}
          {years.map((t) => (
            <text
              key={t.year}
              x={x(t.offset)}
              y={top + plotH + 11 + tickPx * 0.8}
              textAnchor="middle"
              fill={tone.tick}
              className="num"
              style={{ fontSize: `${TICK_REM}rem` }}
            >
              {t.year}
            </text>
          ))}

          {/* The year being read */}
          {hover !== null && readout.length > 0 && <line x1={hoverX} x2={hoverX} y1={top} y2={top + plotH} stroke={tone.rule} strokeWidth="1" />}

          {/* One line per goal */}
          {series.map((sr, i) => (
            <path
              key={sr.goal.id}
              d={lines[i].map((p, j) => `${j ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              fill="none"
              stroke={sr.color}
              strokeWidth="2"
              strokeDasharray={sr.dash}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Rupee view: the ring at what the goal needs, joined to the
              line's end so the gap between them can be seen. */}
          {!share &&
            series.map((sr, i) => (
              <g key={sr.goal.id}>
                {Math.abs(needs[i].y - ends[i].y) > 2 * DOT && (
                  <line x1={ends[i].x} x2={ends[i].x} y1={ends[i].y} y2={needs[i].y} stroke={sr.color} strokeWidth="1" opacity="0.6" />
                )}
                <circle cx={needs[i].x} cy={needs[i].y} r={DOT} fill={tone.ground} stroke={sr.color} strokeWidth="2" />
              </g>
            ))}

          {/* Where each line ends */}
          {series.map((sr, i) => (
            <circle key={sr.goal.id} cx={ends[i].x} cy={ends[i].y} r={MARKER} fill={sr.color} stroke={tone.ground} strokeWidth="2" />
          ))}

          {/* The goal's name at the end of its line */}
          {labels.map((l) => {
            const sr = series.find((it) => it.goal.id === l.id);
            if (!sr) return null;
            return (
              <text
                key={l.id}
                x={l.x}
                y={l.y}
                dy="0.35em"
                textAnchor={l.anchor}
                fill={tone.ink}
                className="font-medium"
                style={{ fontSize: `${NAME_REM}rem`, ...halo }}
              >
                {shortName(sr.goal.name)}
              </text>
            );
          })}

          {readout.map((row) => (
            <circle key={row.sr.goal.id} cx={row.at.x} cy={row.at.y} r="4" fill={row.sr.color} stroke={tone.ground} strokeWidth="2" />
          ))}
        </svg>

        {/* The readout for the year under the pointer. The same figures for
            each goal's own date are in the key below, so nothing depends on it. */}
        {hover !== null && readout.length > 0 && (
          <div
            aria-hidden
            className={`pointer-events-none absolute z-10 rounded-control border px-3 py-2 text-support ${tone.tip}`}
            style={{ left: tipLeft, top: top + 4, width: tipW }}
          >
            <p className="num font-medium">{baseYear + hover}</p>
            <ul className="mt-1 flex flex-col gap-y-0.5">
              {readout.map((row) => (
                <li key={row.sr.goal.id} className="flex items-center gap-2">
                  <LineKey color={row.sr.color} dash={row.sr.dash} />
                  <span className="min-w-0 flex-1 truncate">{row.sr.goal.name}</span>
                  <span className="num whitespace-nowrap font-medium">{row.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* The key: each goal's line, its status, and where the line ends. */}
      <ul className="mt-3 flex flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:gap-x-8">
        {series.map((sr) => (
          <li key={sr.goal.id} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2">
            <LineKey color={sr.color} dash={sr.dash} />
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={tone.name}>{sr.goal.name}</span>
              <StatusPill level={sr.level} />
              <span className={`num whitespace-nowrap ${tone.aside}`}>{figure(sr)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Wrapper>
  );
}
