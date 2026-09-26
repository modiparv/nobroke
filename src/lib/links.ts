import type { Holding } from "./types";
import { UNSORTED_TYPE } from "./holdings.ts";

/**
 * Links between the three pages open the exact thing, never the top of a
 * tab. A link names a section (a focus id); the page scrolls to it and
 * lights it up for a moment. These are the ids every page agrees on.
 */
export const FOCUS = {
  goalDetail: "goal-detail",
  mix: "mix",
  funds: "funds",
  cash: "cash",
  investments: "investments",
  everyMonth: "every-month",
} as const;

export function holdingFocus(id: string): string {
  return `holding:${id}`;
}

/** Words that carry no meaning when matching a fund to a holding's name. */
const NOISE = /\b(fund|direct|growth|regular|plan|option|the|of|and|scheme|idcw|dividend|reinvestment|payout)\b/g;

function key(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The holding in Money that is this fund, if the person already owns it:
    matched by name, with the filler words ("Fund", "Direct", "Growth")
    ignored. The intake's unsplit total is never a match. Null otherwise. */
export function holdingForFund(fundName: string, holdings: Holding[]): Holding | null {
  const want = key(fundName);
  if (want.length < 3) return null;
  for (const h of holdings) {
    if (h.type === UNSORTED_TYPE) continue;
    const have = key(h.name);
    if (have.length < 3) continue;
    if (have === want || have.includes(want) || want.includes(have)) return h;
  }
  return null;
}
