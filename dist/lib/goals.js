/** Gen-Z / millennial life goals. targetToday is a pre-city-adjustment estimate. */
export const GOALS = [
    { id: "emergency", name: "Safety Net", emoji: "🛟", targetToday: 300000, horizonYears: 1, blurb: "6 months of breathing room.", defaultProfile: "conservative", costSensitivity: "none" },
    { id: "travel", name: "Travel the World", emoji: "✈️", targetToday: 500000, horizonYears: 2, blurb: "That trip you keep saving to your camera roll.", defaultProfile: "conservative", costSensitivity: "none" },
    { id: "gadget", name: "New Tech", emoji: "📱", targetToday: 150000, horizonYears: 1, blurb: "Upgrade without the EMI trap.", defaultProfile: "conservative", costSensitivity: "none" },
    { id: "car", name: "Dream Car", emoji: "🚗", targetToday: 1200000, horizonYears: 4, blurb: "Keys to the one you actually want.", defaultProfile: "balanced", costSensitivity: "medium" },
    { id: "wedding", name: "Dream Wedding", emoji: "💍", targetToday: 2000000, horizonYears: 3, blurb: "Your day, your way.", defaultProfile: "balanced", costSensitivity: "medium" },
    { id: "home", name: "First Home", emoji: "🏡", targetToday: 3000000, horizonYears: 7, blurb: "Down payment on your own place.", defaultProfile: "balanced", costSensitivity: "high" },
    { id: "business", name: "Start a Business", emoji: "🚀", targetToday: 1500000, horizonYears: 3, blurb: "Runway to build your thing.", defaultProfile: "aggressive", costSensitivity: "medium" },
    { id: "education", name: "Study / Upskill", emoji: "🎓", targetToday: 4000000, horizonYears: 5, blurb: "Degree, bootcamp, or study abroad.", defaultProfile: "aggressive", costSensitivity: "high" },
    { id: "fire", name: "Early Retirement", emoji: "🔥", targetToday: 30000000, horizonYears: 20, blurb: "Work because you want to, not because you have to.", defaultProfile: "aggressive", costSensitivity: "none" },
    { id: "freedom", name: "Financial Freedom", emoji: "🌅", targetToday: 50000000, horizonYears: 25, blurb: "Total independence, on your terms.", defaultProfile: "aggressive", costSensitivity: "none" },
];
export const GOAL_MAP = Object.fromEntries(GOALS.map((g) => [g.id, g]));
export const DEFAULT_GOAL_ID = "home";
export const CUSTOM_GOAL_ID = "custom";
//# sourceMappingURL=goals.js.map