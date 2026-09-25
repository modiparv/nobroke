import type { Goal } from "./types";

/**
 * The goal catalogue, written for the young Indian planning for the first
 * time: plain names, the amounts such a goal actually costs, the horizon it
 * usually sits at. Ids are permanent (saved plans, the AI's tool schema and
 * the command grammar all key on them); names and defaults may move with
 * the times. Ordered from the nearest, smallest goal to the furthest, with
 * the emergency fund first because it comes first.
 *
 * dateFixed marks the goals whose date is set by life, not by the plan: a
 * child's college year and a wedding. Those never get "move to a later
 * year" as a fix.
 */
export const GOALS: Goal[] = [
  { id: "emergency", name: "Emergency fund", emoji: "🛟", targetToday: 300000, horizonYears: 1, blurb: "Six months of expenses, untouchable.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "course", name: "Upskill or a course", emoji: "📚", targetToday: 50000, horizonYears: 1, blurb: "A certification, a bootcamp, a new skill.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "gadget", name: "New phone or laptop", emoji: "📱", targetToday: 100000, horizonYears: 1, blurb: "Bought outright, no EMI.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "bike", name: "Bike or scooter", emoji: "🛵", targetToday: 100000, horizonYears: 1, blurb: "Your own keys, no EMI.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "college", name: "College fees", emoji: "🏫", targetToday: 150000, horizonYears: 1, blurb: "Next year's fees, ready before they are due.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "travel", name: "Big trip", emoji: "✈️", targetToday: 200000, horizonYears: 1, blurb: "The one on your camera roll.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "loan", name: "Pay off a loan", emoji: "💳", targetToday: 400000, horizonYears: 2, blurb: "Education or personal loan, gone for good.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "car", name: "First car", emoji: "🚗", targetToday: 800000, horizonYears: 4, blurb: "The keys, without a seven-year EMI.", defaultProfile: "balanced", costSensitivity: "medium", dateFixed: false },
  { id: "wedding", name: "Wedding", emoji: "💍", targetToday: 2000000, horizonYears: 3, blurb: "Your day, your way.", defaultProfile: "balanced", costSensitivity: "medium", dateFixed: true },
  { id: "home", name: "Home down payment", emoji: "🏡", targetToday: 3000000, horizonYears: 7, blurb: "The twenty percent that gets you the keys.", defaultProfile: "balanced", costSensitivity: "high", dateFixed: false },
  { id: "parents", name: "Parents' care", emoji: "👨‍👩‍👧", targetToday: 1000000, horizonYears: 5, blurb: "Health cover and comfort for them.", defaultProfile: "balanced", costSensitivity: "medium", dateFixed: false },
  { id: "business", name: "Start something", emoji: "🚀", targetToday: 1500000, horizonYears: 3, blurb: "Runway to build your thing.", defaultProfile: "bold", costSensitivity: "medium", dateFixed: false },
  { id: "education", name: "Study abroad", emoji: "🎓", targetToday: 4000000, horizonYears: 5, blurb: "A master's or a degree abroad, funded.", defaultProfile: "bold", costSensitivity: "high", dateFixed: false },
  { id: "child", name: "Child's education", emoji: "👶", targetToday: 5000000, horizonYears: 15, blurb: "College, fully funded, no loan.", defaultProfile: "bold", costSensitivity: "high", dateFixed: true },
  { id: "fire", name: "Retire early", emoji: "🔥", targetToday: 30000000, horizonYears: 20, blurb: "Work because you want to.", defaultProfile: "bold", costSensitivity: "none", dateFixed: false },
  { id: "freedom", name: "Financial freedom", emoji: "🌅", targetToday: 50000000, horizonYears: 25, blurb: "Enough that income becomes optional.", defaultProfile: "bold", costSensitivity: "none", dateFixed: false },
];

export const GOAL_MAP: Record<string, Goal> = Object.fromEntries(GOALS.map((g) => [g.id, g]));
export const DEFAULT_GOAL_ID = "home";

/**
 * A saved plan carries each goal's name and emoji from the day it was saved.
 * Ids are permanent and names move with the catalogue, so a plan saved with
 * "Study abroad or upskill" loads as "Study abroad". A goal with an id the
 * catalogue does not know is left exactly as stored.
 */
export function refreshGoalNames<T extends { id: string }>(goals: T[]): T[] {
  return goals.map((g) => {
    const current = GOAL_MAP[g.id];
    return current ? { ...g, name: current.name, emoji: current.emoji } : g;
  });
}
