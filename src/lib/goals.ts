import type { Goal } from "./types";

export const GOALS: Goal[] = [
  { id: "emergency", name: "Safety Net", emoji: "🛟", targetToday: 300000, horizonYears: 1, blurb: "6 months of breathing room.", defaultProfile: "steady", costSensitivity: "none" },
  { id: "travel", name: "Travel the World", emoji: "✈️", targetToday: 500000, horizonYears: 2, blurb: "That trip on your camera roll.", defaultProfile: "steady", costSensitivity: "none" },
  { id: "gadget", name: "New Tech", emoji: "📱", targetToday: 150000, horizonYears: 1, blurb: "Upgrade without the EMI trap.", defaultProfile: "steady", costSensitivity: "none" },
  { id: "car", name: "Dream Car", emoji: "🚗", targetToday: 1200000, horizonYears: 4, blurb: "Keys to the one you want.", defaultProfile: "balanced", costSensitivity: "medium" },
  { id: "wedding", name: "Dream Wedding", emoji: "💍", targetToday: 2000000, horizonYears: 3, blurb: "Your day, your way.", defaultProfile: "balanced", costSensitivity: "medium" },
  { id: "home", name: "First Home", emoji: "🏡", targetToday: 3000000, horizonYears: 7, blurb: "Down payment on your place.", defaultProfile: "balanced", costSensitivity: "high" },
  { id: "business", name: "Start a Business", emoji: "🚀", targetToday: 1500000, horizonYears: 3, blurb: "Runway to build your thing.", defaultProfile: "bold", costSensitivity: "medium" },
  { id: "education", name: "Study / Upskill", emoji: "🎓", targetToday: 4000000, horizonYears: 5, blurb: "Degree, bootcamp or abroad.", defaultProfile: "bold", costSensitivity: "high" },
  { id: "fire", name: "Early Retirement", emoji: "🔥", targetToday: 30000000, horizonYears: 20, blurb: "Work because you want to.", defaultProfile: "bold", costSensitivity: "none" },
  { id: "freedom", name: "Financial Freedom", emoji: "🌅", targetToday: 50000000, horizonYears: 25, blurb: "Total independence.", defaultProfile: "bold", costSensitivity: "none" },
];

export const GOAL_MAP: Record<string, Goal> = Object.fromEntries(GOALS.map((g) => [g.id, g]));
export const DEFAULT_GOAL_ID = "home";
