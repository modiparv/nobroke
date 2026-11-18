import { projectionSeries } from "./finance.ts";
import { formatINR } from "./format.ts";

/**
 * The landing page's worked example: one monthly amount, three goals, and
 * what that amount adds up to by the last goal's year.
 *
 * Every figure the page prints comes from here, through the engine's own
 * projection (lib/finance projectionSeries: the month's money goes in, then
 * the month's growth is added). The hero used to carry three hand-typed
 * figures for ₹25,000 a month over 20 years: put in ₹60.0L, growth ₹1.4Cr,
 * about ₹2.0Cr. The test beside this file checks that this arithmetic gives
 * those same figures, so the two examples below are the same sum with
 * different inputs.
 */

/**
 * Growth assumed in the example, a year. 10.4% is what the product's
 * Balanced starting mix assumes (10.375%, shown as 10.4%), and it is the
 * rate that reproduces the hero's earlier figures. The page prints this
 * number next to the growth it produces.
 */
export const HERO_GROWTH = 0.104;

export interface HeroGoal {
  /** Short enough to sit at the end of a chart line on a 360px phone. */
  name: string;
  /** Years from now. */
  years: number;
}

export interface HeroExample {
  id: "student" | "family";
  who: string;
  monthly: number;
  goals: HeroGoal[];
}

/**
 * The two examples behind the toggle. Goal names are the catalogue's
 * (lib/goals), shortened. Each example runs to its own last goal: a
 * student's goals are near, a family's are far.
 */
export const HERO_EXAMPLES: HeroExample[] = [
  {
    id: "student",
    who: "Student",
    monthly: 3000,
    goals: [
      { name: "Laptop", years: 1 },
      { name: "Big trip", years: 2 },
      { name: "Bike", years: 4 },
    ],
  },
  {
    id: "family",
    who: "Family",
    monthly: 37000,
    goals: [
      { name: "Parents' care", years: 5 },
      { name: "Child's college", years: 10 },
      { name: "Retire early", years: 20 },
    ],
  },
];

/** The toggle's label: "Student · ₹3,000 a month". */
export function heroLabel(example: Pick<HeroExample, "who" | "monthly">): string {
  return `${example.who} · ${formatINR(example.monthly, { compact: false })} a month`;
}

/** Years to the furthest goal: how long the example runs. */
export function heroYears(goals: HeroGoal[]): number {
  return Math.max(1, ...goals.map((g) => g.years));
}

export interface HeroFigures {
  years: number;
  endYear: number;
  /** The monthly amount, every month, with no growth. */
  putIn: number;
  /** What growth adds on top. putIn + growth is exactly total. */
  growth: number;
  total: number;
}

/** A monthly amount put in for `years` years, growing at HERO_GROWTH. */
export function heroFigures(monthly: number, years: number, startYear: number): HeroFigures {
  const series = projectionSeries(
    { targetToday: 0, horizonYears: years, currentSavings: 0, monthlySip: monthly, inflation: 0, allocation: {} },
    HERO_GROWTH,
  );
  const last = series[series.length - 1];
  const total = Math.round(last.value);
  return { years, endYear: startYear + years, putIn: last.invested, growth: total - last.invested, total };
}

/** The figures for one of the toggle's examples. */
export function heroExampleFigures(example: HeroExample, startYear: number): HeroFigures {
  return heroFigures(example.monthly, heroYears(example.goals), startYear);
}

export interface HeroLine {
  name: string;
  year: number;
  /**
   * The line, from the shared start to the goal's circle. x is the share of
   * the example's time span (0 is now, 1 is the last goal's year); y is
   * height on the drawing (0 is the baseline, 1 is the top). Every line has
   * the same number of points, so one drawing can ease into another.
   */
  points: Array<[number, number]>;
}

/** Points per line, after the start. */
export const HERO_LINE_STEPS = 24;

// Where the nearest and the furthest goal's lines end, as a share of the
// drawing's height. The gap between neighbours leaves room for a two-line
// label above each circle.
const NEAREST_END = 0.36;
const FURTHEST_END = 0.9;

/**
 * The drawing: one line per goal, in date order, all from the same start.
 *
 * Time runs left to right on an even scale, so each line ends at its own
 * year. The bend of each line is real: it is the shape money takes when the
 * same amount goes in every month and grows at HERO_GROWTH, so a one-year
 * line is nearly straight and a twenty-year line curves up. The heights are
 * not to scale. A goal a year away and a goal twenty years away differ so
 * much in rupees that the near one would lie flat on the baseline, so each
 * line ends at a set height by its place in the order. The page shows no
 * value axis for that reason.
 */
export function heroLines(goals: HeroGoal[], startYear: number): HeroLine[] {
  const ordered = [...goals].sort((a, b) => a.years - b.years);
  const span = heroYears(ordered);
  return ordered.map((goal, i) => {
    const end = ordered.length > 1 ? NEAREST_END + ((FURTHEST_END - NEAREST_END) * i) / (ordered.length - 1) : FURTHEST_END;
    const series = projectionSeries(
      { targetToday: 0, horizonYears: goal.years, currentSavings: 0, monthlySip: 1, inflation: 0, allocation: {} },
      HERO_GROWTH,
    );
    const months = series.length - 1;
    const full = series[months].value;
    const points: Array<[number, number]> = [];
    for (let k = 0; k <= HERO_LINE_STEPS; k++) {
      const at = (k / HERO_LINE_STEPS) * months;
      const lo = Math.floor(at);
      const hi = Math.min(months, lo + 1);
      const value = series[lo].value + (series[hi].value - series[lo].value) * (at - lo);
      points.push([((k / HERO_LINE_STEPS) * goal.years) / span, (end * value) / full]);
    }
    return { name: goal.name, year: startYear + goal.years, points };
  });
}
