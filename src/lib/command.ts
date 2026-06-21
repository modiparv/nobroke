import { GOALS } from "./goals";

/**
 * Tiny natural-language → action layer for the copilot bar. It recognises the
 * common "change my plan" intents on-device (no AI round-trip needed) so the
 * copilot can actually DO things — add goals, set targets/timelines, move money
 * — and anything it can't parse falls through to the AI for a general answer.
 */
export type Command =
  | { kind: "addGoal"; goalId: string; name: string }
  | { kind: "removeGoal"; goalId: string; name: string }
  | { kind: "setPool"; amount: number }
  | { kind: "setCash"; amount: number }
  | { kind: "setTarget"; goalId: string; name: string; amount: number }
  | { kind: "setYears"; goalId: string; name: string; years: number }
  | { kind: "autoSplit" }
  | { kind: "recommendPortfolio" };

// Loose keyword → goal id map (first match wins).
const GOAL_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(safety|emergency|rainy)\b/, "emergency"],
  [/\b(travel|trip|vacation|holiday)\b/, "travel"],
  [/\b(gadget|tech|phone|laptop|iphone|macbook)\b/, "gadget"],
  [/\b(car|bike|scooter|vehicle)\b/, "car"],
  [/\b(wedding|marriage|shaadi)\b/, "wedding"],
  [/\b(home|house|flat|apartment|property)\b/, "home"],
  [/\b(business|startup|venture)\b/, "business"],
  [/\b(education|study|upskill|college|degree|masters|abroad)\b/, "education"],
  [/\b(retire|retirement|fire)\b/, "fire"],
  [/\b(freedom|independen)\b/, "freedom"],
];

function findGoal(text: string): { id: string; name: string } | null {
  for (const [re, id] of GOAL_KEYWORDS) {
    if (re.test(text)) {
      const g = GOALS.find((x) => x.id === id);
      if (g) return { id, name: g.name };
    }
  }
  return null;
}

/** Parse "30k", "30,000", "5 lakh / lac", "1.2 cr / crore", "₹50L". */
export function parseAmountINR(text: string): number | null {
  const m = text.match(/(?:₹|rs\.?\s*)?(\d[\d,]*\.?\d*)\s*(k|thousand|l|lac|lakh|lakhs|cr|crore|crores|m|mn|million)?/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  const unit = (m[2] || "").toLowerCase();
  let mult = 1;
  if (unit === "k" || unit === "thousand") mult = 1e3;
  else if (unit === "l" || unit === "lac" || unit === "lakh" || unit === "lakhs") mult = 1e5;
  else if (unit === "cr" || unit === "crore" || unit === "crores") mult = 1e7;
  else if (unit === "m" || unit === "mn" || unit === "million") mult = 1e6;
  return Math.round(num * mult);
}

export function parseCommand(raw: string): Command | null {
  const text = raw.toLowerCase().trim();
  if (!text) return null;

  // Re-tune the single portfolio to the goals.
  if (/\bmatch (my )?(portfolio|mix)\b/.test(text) || (/\b(match|recommend|fix|suggest|optimi[sz]e)\b/.test(text) && /\b(portfolio|mix|funds?|investments?|allocation)\b/.test(text)))
    return { kind: "recommendPortfolio" };

  // Auto-balance money across goals.
  if (/\b(auto.?balance|balance my money|balance the money|split (the |my )?money|distribute (the |my )?money|recommend (the )?split|auto.?split)\b/.test(text))
    return { kind: "autoSplit" };

  // Remove a goal.
  if (/\b(remove|delete|drop|cancel|get rid of)\b/.test(text)) {
    const g = findGoal(text);
    if (g) return { kind: "removeGoal", goalId: g.id, name: g.name };
  }

  const goal = findGoal(text);

  // Set a goal's timeline.
  const byYear = text.match(/\bby\s+(20\d{2})\b/);
  const inYears = text.match(/\b(?:in|within)\s+(\d{1,2})\s*(?:years?|yrs?)\b/) || text.match(/\b(\d{1,2})\s*(?:years?|yrs?)\b/);
  if (goal && (byYear || inYears)) {
    const years = byYear ? Number(byYear[1]) - new Date().getFullYear() : Number(inYears![1]);
    if (years > 0 && years <= 60) return { kind: "setYears", goalId: goal.id, name: goal.name, years };
  }

  const amount = parseAmountINR(text);

  // Set a goal's target amount.
  if (goal && amount && /\b(target|cost|costs?|worth|need|needs|budget|goal|to|=)\b/.test(text))
    return { kind: "setTarget", goalId: goal.id, name: goal.name, amount };

  // Monthly investing pool (no specific goal).
  if (amount && !goal && /\b(invest|sip|per month|a month|monthly|each month|\/mo|month|put away|set aside)\b/.test(text))
    return { kind: "setPool", amount };

  // Cash in hand / bank (no specific goal).
  if (amount && !goal && /\b(savings?|cash|bank|saved|have|got|sitting)\b/.test(text))
    return { kind: "setCash", amount };

  // Add a goal (explicit intent, or a bare "<goal> <amount>").
  if (goal && /\b(add|create|new|start|save for|saving for|want|wanna|plan for|include|buy|get)\b/.test(text))
    return { kind: "addGoal", goalId: goal.id, name: goal.name };
  if (goal && amount) return { kind: "setTarget", goalId: goal.id, name: goal.name, amount };

  return null;
}
