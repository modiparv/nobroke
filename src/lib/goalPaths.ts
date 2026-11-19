import { requiredCorpus } from "./finance.ts";
import type { ProjectionPoint } from "./types";

/**
 * The goals chart, rescaled so every goal can be read.
 *
 * On one rupee axis a ₹10 Cr retirement flattens a ₹10 L goal onto the
 * baseline. Here each goal is plotted against its own cost instead: at every
 * point in time, how much of that goal's cost the money covers. The cost
 * rises with prices each year, so this is the share in today's money, and it
 * ends exactly where the plan's own progress figure ends (projected ÷
 * needed). No money maths of its own: the projection comes from
 * lib/finance's projectionSeries and the cost from its requiredCorpus.
 *
 * The rest of the file is the chart's geometry, kept pure so it can be
 * tested: axis ticks, and where the goal names sit at the line ends.
 */

/** Shares above this are drawn at this height: one goal covered many times
    over must not squash the others. */
export const SHARE_CAP = 2;

/** How much of a cost the money covers, from 0 upward. A goal that costs
    nothing is covered (the same rule as computePlan's progress). */
export function coveredShare(value: number, cost: number): number {
  if (!(cost > 0)) return 1;
  if (!(value > 0)) return 0;
  return value / cost;
}

export interface SharePoint {
  year: number;
  share: number;
}

/** A goal's projected path as a share of its cost in each year. */
export function sharePath(points: ProjectionPoint[], targetToday: number, inflation: number): SharePoint[] {
  return points.map((p) => ({
    year: p.year,
    share: coveredShare(p.value, requiredCorpus(targetToday, inflation, p.year)),
  }));
}

const group = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** A share in words, to the nearest whole percent, as the plan's "% there"
    figure has always been rounded. Two honest exceptions: a goal that is
    even a little short never reads "100%", and a sliver of money never
    reads "0%". */
export function shareLabel(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return "0%";
  const covered = share >= 1 - 1e-9;
  const pct = covered ? Math.round(share * 100) : Math.min(99, Math.round(share * 100));
  if (pct === 0) return "Under 1%";
  return `${group.format(pct)}%`;
}

export interface ShareAxis {
  /** The share at the top edge of the plot. */
  top: number;
  ticks: number[];
  /** True when a goal is covered more than SHARE_CAP times over. */
  capped: boolean;
}

/** The share axis: 0 at the bottom, room above 100% for the names, and never
    taller than SHARE_CAP however far ahead one goal is. `headroom` is the
    part of the plot's height, at the top, that no line and no tick may enter:
    the caption for the zone above 100% sits there, clear of everything. */
export function shareAxis(maxShare: number, minTop = 1.25, headroom = 0.08): ShareAxis {
  const peak = Number.isFinite(maxShare) ? Math.max(0, maxShare) : 0;
  const capped = peak > SHARE_CAP;
  const clear = Math.min(Math.max(Number.isFinite(headroom) ? headroom : 0, 0), 0.5);
  // The highest thing drawn is a line's top or, failing that, the 100% rule.
  const highest = Math.max(1, Math.min(peak, SHARE_CAP));
  const top = Math.max(minTop, 1.05, highest / (1 - clear));
  const ceiling = Math.min(top * (1 - clear), SHARE_CAP);
  const ticks: number[] = [];
  for (let i = 0; i * 0.5 <= ceiling + 1e-9; i++) ticks.push(i * 0.5);
  return { top, ticks, capped };
}

export interface YearTick {
  /** Years from today. */
  offset: number;
  /** The calendar year it reads as. */
  year: number;
}

const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100];

/** Whole calendar years along the time axis, at most `maxTicks` of them.
    The last whole year is always one of them: it is the date a goal is for,
    so it takes the place of the regular tick just before it. */
export function yearTicks(baseYear: number, spanYears: number, maxTicks = 6): YearTick[] {
  const base = Math.round(baseYear);
  const span = Number.isFinite(spanYears) ? Math.max(0, Math.floor(spanYears + 1e-9)) : 0;
  const limit = Math.max(2, Math.floor(maxTicks));
  const step = YEAR_STEPS.find((s) => Math.floor(span / s) + 1 <= limit) ?? YEAR_STEPS[YEAR_STEPS.length - 1];
  const offsets: number[] = [];
  for (let offset = 0; offset <= span; offset += step) offsets.push(offset);
  if (offsets[offsets.length - 1] !== span) {
    if (offsets.length > 1) offsets.pop();
    offsets.push(span);
  }
  return offsets.map((offset) => ({ offset, year: base + offset }));
}

/** Round rupee values for an axis that runs from 0 to `max`: steps of 1, 2,
    2.5 or 5 times a power of ten, which read cleanly in lakh and crore. */
export function niceTicks(max: number, target = 4): number[] {
  if (!Number.isFinite(max) || max < 1) return [];
  const raw = max / Math.max(1, target);
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const steps = pow >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
  const step = (steps.find((m) => m * pow >= raw) ?? 10) * pow;
  const out: number[] = [];
  for (let k = 1; k * step <= max * (1 + 1e-9); k++) out.push(k * step);
  return out;
}

/** A rough text width for when the browser cannot measure (tests, first
    paint). Errs wide, so a label is dropped before it is allowed to collide. */
export function estimateTextWidth(text: string, fontPx: number): number {
  let em = 0;
  for (const ch of text) {
    if ("ijlI.,:;'’|!".includes(ch)) em += 0.3;
    else if (" ftr()1".includes(ch)) em += 0.4;
    else if ("mwMW%₹".includes(ch)) em += 0.9;
    else if (ch >= "A" && ch <= "Z") em += 0.72;
    else em += 0.6;
  }
  return em * fontPx;
}

/** Shorten a long name so it can sit on the chart; the legend has it in full. */
export function shortName(name: string, max = 22): string {
  const clean = name.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

// ---------- Names at the line ends ----------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}

/** The point a label names (a line's end) and the width of its text. */
export interface LabelTarget {
  id: string;
  x: number;
  y: number;
  w: number;
  /** Other marks of the same goal the name may sit beside instead, when the
      line's end is crowded (the ring at what the goal needs). */
  alt?: Pt[];
}

export interface PlacedLabel {
  id: string;
  /** Where the text is anchored: its left edge ("start") or right edge ("end"). */
  x: number;
  /** The text's vertical centre. */
  y: number;
  anchor: "start" | "end";
  box: Box;
  /** Set when the name sits a row away from its mark: a short line to draw
      from the name to the mark, so the two still read as one. */
  leader?: { from: Pt; to: Pt };
}

export interface LabelLayout {
  /** Labels stay inside this. */
  bounds: Box;
  /** Height of one label. */
  h: number;
  /** Clear space between a marker and its label. */
  gap?: number;
  /** Radius of the marker drawn on each point. */
  marker?: number;
  /** Things no label may touch: tick text, rings, a fixed caption. */
  obstacles?: Box[];
  /** The drawn lines. A label avoids sitting on one when it can. */
  lines?: Pt[][];
  /** Horizontal rules a label would rather not straddle. */
  rules?: number[];
  /** Leave a label off rather than accept a place that costs more than
      this. A crowded chart sets it, so names never sit on lines. */
  maxCost?: number;
}

export function boxesOverlap(a: Box, b: Box, pad = 0): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

/** Does the segment from a to b pass through the box? (Liang-Barsky clipping.) */
function segmentHitsBox(a: Pt, b: Pt, box: Box): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - box.x, box.x + box.w - a.x, a.y - box.y, box.y + box.h - a.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
}

function lineHitsBox(line: Pt[], box: Box): boolean {
  for (let i = 1; i < line.length; i++) if (segmentHitsBox(line[i - 1], line[i], box)) return true;
  return false;
}

/** The point of a box nearest to p. */
function nearestOnBox(p: Pt, box: Box): Pt {
  return { x: Math.min(Math.max(p.x, box.x), box.x + box.w), y: Math.min(Math.max(p.y, box.y), box.y + box.h) };
}

/** How far a point is from a box: 0 inside it, else the gap to its nearest edge. */
function distanceToBox(p: Pt, box: Box): number {
  const q = nearestOnBox(p, box);
  return Math.hypot(q.x - p.x, q.y - p.y);
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const side = (p: Pt, q: Pt, o: Pt) => Math.sign((q.x - p.x) * (o.y - p.y) - (q.y - p.y) * (o.x - p.x));
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
}

function lineCrosses(line: Pt[], a: Pt, b: Pt): boolean {
  for (let i = 1; i < line.length; i++) if (segmentsCross(line[i - 1], line[i], a, b)) return true;
  return false;
}

interface Candidate {
  box: Box;
  anchor: "start" | "end";
  cost: number;
  /** The mark this place is beside. */
  mark: Pt;
  /** A row away from the mark: drawn with a leader. */
  far: boolean;
  /** Only the leader says whose name this is: without one it must go. */
  needsLeader?: boolean;
}

const PAD = 2;
/** Two names side by side keep a word's space apart, or they read as one. */
const BETWEEN_NAMES = 8;
const SKIP_COST = 1000;
/** A name must sit this much nearer to its own goal's mark than to any other
    goal's, or it reads as the other goal's name. */
const CLEARLY_NEARER = 3;
const AT_ANOTHER_MARK = 3;
const ON_A_LINE = 12;
/** Another goal's line runs between the name and its own dot, so the name
    reads as that line's. Costs more than a second-row place with a leader. */
const LINE_BETWEEN = 15;
/** A name set on the 100% rule reads as struck through, so that place costs
    more than moving the name above or below the rule. */
const ON_A_RULE = 8;
const SEARCH_LIMIT = 20000;

/** Two names collide if they overlap, or sit side by side with less than a word's space between. */
function namesTouch(a: Box, b: Box): boolean {
  return a.x < b.x + b.w + BETWEEN_NAMES && b.x < a.x + a.w + BETWEEN_NAMES && a.y < b.y + b.h + PAD && b.y < a.y + a.h + PAD;
}

/**
 * Put each name beside the end of its line without any two colliding.
 *
 * Each label tries a short list of places around its point, nearest first:
 * to the right, above (ending or starting at the point), to the left,
 * below, then a second row above; then the same places around the goal's
 * other mark, if it has one. A place is ruled out if it leaves the bounds,
 * touches an obstacle or any other mark, or lies as near to another goal's
 * mark as to its own (a name right above a neighbour's dot reads as the
 * neighbour's name). Sitting on a drawn line or a rule is allowed but costs
 * more, and so does a place that another goal's line cuts off from the
 * mark: then the name moves up a row and is joined to its mark by a leader,
 * which also lets it stand nearer a neighbour's dot than a bare name may.
 * A small search then picks the cheapest set of places with no two labels
 * touching. A label with nowhere to go is left off (the legend still names
 * it) rather than drawn over another or beside the wrong line.
 */
export function placeLabels(targets: LabelTarget[], layout: LabelLayout): PlacedLabel[] {
  const { bounds, h } = layout;
  const gap = layout.gap ?? 4;
  const r = layout.marker ?? 4.5;
  const obstacles = layout.obstacles ?? [];
  const lines = layout.lines ?? [];
  const rules = layout.rules ?? [];
  const maxCost = layout.maxCost ?? SKIP_COST - 1;
  const right = bounds.x + bounds.w;
  const bottom = bounds.y + bounds.h;

  const markerAt = (p: Pt): Box => ({ x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r });
  const marksOf = (t: LabelTarget): Pt[] => [{ x: t.x, y: t.y }, ...(t.alt ?? [])];
  const allMarks = targets.flatMap(marksOf);

  const candidatesFor = (t: LabelTarget): Candidate[] => {
    const own = marksOf(t);
    // Other goals' marks. One that sits within a marker's radius of this
    // goal's is the same dot to the eye: both names belong beside it.
    const foreign = targets
      .filter((o) => o !== t)
      .flatMap(marksOf)
      .filter((m) => !own.some((p) => Math.hypot(m.x - p.x, m.y - p.y) <= r));
    const readsAsAnother = (box: Box): boolean => {
      const mine = Math.min(...own.map((p) => distanceToBox(p, box)));
      return foreign.some((m) => distanceToBox(m, box) < mine + CLEARLY_NEARER);
    };
    // Lines that neither start nor end on one of this goal's marks are other goals'.
    const isOwnMark = (q: Pt | undefined) => !!q && own.some((p) => Math.hypot(q.x - p.x, q.y - p.y) < 0.5);
    const otherLines = lines.filter((line) => !isOwnMark(line[0]) && !isOwnMark(line[line.length - 1]));
    const around = (p: Pt, extra: number): Candidate[] => {
      // Rows: level with the mark, just above it, just below it, a second row above.
      const level = p.y - h / 2;
      const above = p.y - r - gap - h;
      const below = p.y + r + gap;
      const above2 = above - h - PAD;
      // Columns: ending at the mark, starting at it, centred (slid to stay in
      // bounds), wholly to its left, wholly to its right.
      const ending = p.x + r - t.w;
      const starting = p.x - r;
      const centred = Math.min(Math.max(p.x - t.w / 2, bounds.x), right - t.w);
      const leftOf = p.x - r - gap - t.w;
      const rightOf = p.x + r + gap;
      const at = (x: number, y: number, anchor: "start" | "end", cost: number): Candidate => ({
        box: { x, y, w: t.w, h },
        anchor,
        cost: cost + extra,
        mark: p,
        far: y === above2,
      });
      // Every other mark on the chart, this goal's own other mark included.
      const others = allMarks.filter((m) => m.x !== p.x || m.y !== p.y).map(markerAt);
      return [
        at(rightOf, level, "start", 0),
        at(ending, above, "end", 1),
        at(leftOf, level, "end", 1.5),
        at(starting, above, "start", 2),
        at(centred, above, "start", 3),
        at(leftOf, above, "end", 4),
        at(rightOf, above, "start", 5),
        at(ending, below, "end", 6),
        at(starting, below, "start", 7),
        at(centred, below, "start", 8),
        at(leftOf, below, "end", 9),
        at(rightOf, below, "start", 10),
        at(ending, above2, "end", 12),
        at(starting, above2, "start", 13),
        at(centred, above2, "start", 14),
      ].filter(({ box }) => !others.some((o) => boxesOverlap(box, o, PAD)));
    };
    return [...around({ x: t.x, y: t.y }, 0), ...(t.alt ?? []).flatMap((p) => around(p, AT_ANOTHER_MARK))]
      .filter(({ box }) => box.x >= bounds.x && box.x + box.w <= right && box.y >= bounds.y && box.y + box.h <= bottom)
      .filter(({ box }) => !obstacles.some((o) => boxesOverlap(box, o, PAD)))
      // A name with a leader is tied to its mark by the leader, so it may
      // sit where a bare name would be taken for a neighbour's.
      .map((c) => ({ ...c, needsLeader: readsAsAnother(c.box) }))
      .filter((c) => c.far || !c.needsLeader)
      .map((c) => {
        let cost = c.cost;
        for (const line of lines) if (lineHitsBox(line, c.box)) cost += ON_A_LINE;
        for (const y of rules) if (y > c.box.y + 1 && y < c.box.y + c.box.h - 1) cost += ON_A_RULE;
        if (!c.far && otherLines.some((line) => lineCrosses(line, c.mark, nearestOnBox(c.mark, c.box)))) cost += LINE_BETWEEN;
        return { ...c, cost };
      })
      .filter((c) => c.cost <= maxCost)
      .sort((a, b) => a.cost - b.cost);
  };

  // Left to right, so neighbours are decided next to each other.
  const order = targets.map((_, i) => i).sort((a, b) => targets[a].x - targets[b].x || targets[a].y - targets[b].y);
  const options = order.map((i) => candidatesFor(targets[i]));
  // The least each remaining label can cost, for pruning.
  const least: number[] = new Array(order.length + 1).fill(0);
  for (let k = order.length - 1; k >= 0; k--) least[k] = least[k + 1] + Math.min(SKIP_COST, options[k][0]?.cost ?? SKIP_COST);

  let cheapest: { cost: number; picks: Array<Candidate | null> } = { cost: Infinity, picks: [] };
  let visited = 0;
  const picks: Array<Candidate | null> = [];
  const walk = (k: number, cost: number) => {
    if (cost + least[k] >= cheapest.cost) return;
    if (k === order.length) {
      cheapest = { cost, picks: picks.slice() };
      return;
    }
    if (++visited > SEARCH_LIMIT && cheapest.cost < Infinity) return;
    for (const c of options[k]) {
      if (picks.some((p) => p && namesTouch(p.box, c.box))) continue;
      picks.push(c);
      walk(k + 1, cost + c.cost);
      picks.pop();
    }
    picks.push(null);
    walk(k + 1, cost + SKIP_COST);
    picks.pop();
  };
  walk(0, 0);

  const placed: PlacedLabel[] = [];
  targets.forEach((t, i) => {
    const pick = cheapest.picks[order.indexOf(i)];
    if (!pick) return;
    const label: PlacedLabel = {
      id: t.id,
      x: pick.anchor === "start" ? pick.box.x : pick.box.x + pick.box.w,
      y: pick.box.y + pick.box.h / 2,
      anchor: pick.anchor,
      box: pick.box,
    };
    if (pick.far) {
      // From the name down to the edge of its marker, unless another name is in the way.
      const from = nearestOnBox(pick.mark, pick.box);
      const length = Math.hypot(pick.mark.x - from.x, pick.mark.y - from.y);
      const reach = Math.max(0, length - r - 1) / (length || 1);
      const to = { x: from.x + (pick.mark.x - from.x) * reach, y: from.y + (pick.mark.y - from.y) * reach };
      const blocked = cheapest.picks.some((other) => other && other !== pick && segmentHitsBox(from, to, other.box));
      if (!blocked) label.leader = { from, to };
      else if (pick.needsLeader) return;
    }
    placed.push(label);
  });
  return placed;
}
