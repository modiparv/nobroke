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
 * child's college year, college fees that fall due, a wedding. Those never
 * get "move to a later year" as a fix.
 */
export const GOALS: Goal[] = [
  { id: "emergency", name: "Emergency fund", emoji: "🛟", targetToday: 300000, horizonYears: 1, blurb: "About six months of your rent, EMIs and spending.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "course", name: "Upskill or a course", emoji: "📚", targetToday: 50000, horizonYears: 1, blurb: "A certification, a bootcamp or a short course.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "gadget", name: "New phone or laptop", emoji: "📱", targetToday: 100000, horizonYears: 1, blurb: "A phone or laptop, paid for in full.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "bike", name: "Bike or scooter", emoji: "🛵", targetToday: 100000, horizonYears: 1, blurb: "A two-wheeler, paid for in full.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "college", name: "College fees", emoji: "🏫", targetToday: 150000, horizonYears: 1, blurb: "Next year's fees, ready before they are due.", defaultProfile: "steady", costSensitivity: "none", dateFixed: true },
  { id: "travel", name: "Big trip", emoji: "✈️", targetToday: 200000, horizonYears: 1, blurb: "A holiday in India or abroad.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "loan", name: "Pay off a loan", emoji: "💳", targetToday: 400000, horizonYears: 2, blurb: "The amount left on an education or personal loan.", defaultProfile: "steady", costSensitivity: "none", dateFixed: false },
  { id: "car", name: "First car", emoji: "🚗", targetToday: 800000, horizonYears: 4, blurb: "A car, paid for from savings.", defaultProfile: "balanced", costSensitivity: "medium", dateFixed: false },
  { id: "wedding", name: "Wedding", emoji: "💍", targetToday: 2000000, horizonYears: 3, blurb: "Venue, food, clothes and travel for a wedding.", defaultProfile: "balanced", costSensitivity: "medium", dateFixed: true },
  { id: "home", name: "Home down payment", emoji: "🏡", targetToday: 3000000, horizonYears: 7, blurb: "The amount you pay upfront when you buy a home.", defaultProfile: "balanced", costSensitivity: "high", dateFixed: false },
  { id: "parents", name: "Parents' care", emoji: "👨‍👩‍👧", targetToday: 1000000, horizonYears: 5, blurb: "Health cover and care for your parents.", defaultProfile: "balanced", costSensitivity: "medium", dateFixed: false },
  { id: "business", name: "Start something", emoji: "🚀", targetToday: 1500000, horizonYears: 3, blurb: "Money to start a business.", defaultProfile: "bold", costSensitivity: "medium", dateFixed: false },
  { id: "education", name: "Study abroad", emoji: "🎓", targetToday: 4000000, horizonYears: 5, blurb: "Fees and living costs for a degree abroad.", defaultProfile: "bold", costSensitivity: "high", dateFixed: false },
  { id: "child", name: "Child's education", emoji: "👶", targetToday: 5000000, horizonYears: 15, blurb: "Your child's college fees, without a loan.", defaultProfile: "bold", costSensitivity: "high", dateFixed: true },
  { id: "fire", name: "Retire early", emoji: "🔥", targetToday: 30000000, horizonYears: 20, blurb: "Enough invested to stop working early.", defaultProfile: "bold", costSensitivity: "none", dateFixed: false },
  { id: "freedom", name: "Financial freedom", emoji: "🌅", targetToday: 50000000, horizonYears: 25, blurb: "Enough invested to live on without a salary.", defaultProfile: "bold", costSensitivity: "none", dateFixed: false },
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
