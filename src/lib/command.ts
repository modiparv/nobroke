/**
 * Natural-language → action layer for the copilot bar. Self-contained (no imports)
 * so it can be unit-tested in isolation. It recognises the common "change my plan"
 * intents on-device so the copilot can actually DO things; anything it can't parse
 * falls through to the AI for a general answer.
 */
export type Command =
  | { kind: "addGoal"; goalId: string; name: string }
  | { kind: "removeGoal"; goalId: string; name: string }
  | { kind: "setPool"; amount: number }
  | { kind: "setCash"; amount: number }
  | { kind: "setTarget"; goalId: string; name: string; amount: number }
  | { kind: "setYears"; goalId: string; name: string; years: number }
  | { kind: "autoSplit" }
  | { kind: "recommendPortfolio" }
  | { kind: "newPlan" };

// Loose keyword → { id, display name } map (ids match src/lib/goals.ts).
const GOAL_KEYWORDS: Array<{ re: RegExp; id: string; name: string }> = [
  { re: /\b(safety net|safety|emergency|rainy day)\b/, id: "emergency", name: "Safety Net" },
  { re: /\b(travel|trip|vacation|holiday)\b/, id: "travel", name: "Travel the World" },
  { re: /\b(gadget|tech|phone|laptop|iphone|macbook)\b/, id: "gadget", name: "New Tech" },
  { re: /\b(car|bike|scooter|vehicle)\b/, id: "car", name: "Dream Car" },
  { re: /\b(wedding|marriage|shaadi)\b/, id: "wedding", name: "Dream Wedding" },
  { re: /\b(home|house|flat|apartment|property)\b/, id: "home", name: "First Home" },
  { re: /\b(business|startup|venture)\b/, id: "business", name: "Start a Business" },
  { re: /\b(education|study|upskill|college|degree|masters|abroad)\b/, id: "education", name: "Study / Upskill" },
  { re: /\b(retire|retirement|fire)\b/, id: "fire", name: "Early Retirement" },
  { re: /\b(financial freedom|freedom|independence)\b/, id: "freedom", name: "Financial Freedom" },
];

function findGoal(text: string): { goalId: string; name: string } | null {
  for (const g of GOAL_KEYWORDS) if (g.re.test(text)) return { goalId: g.id, name: g.name };
  return null;
}

/** Parse "30k", "30,000", "5 lakh / lac", "1.2 cr / crore", "₹50L". */
export function parseAmountINR(text: string): number | null {
  const m = text.match(/(?:₹|rs\.?\s*)?(\d[\d,]*\.?\d*)\s*(k|thousand|l|lac|lakh|lakhs|cr|crore|crores|m|mn|million)?\b/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = (m[2] || "").toLowerCase();
  let mult = 1;
  if (unit === "k" || unit === "thousand") mult = 1e3;
  else if (unit === "l" || unit === "lac" || unit === "lakh" || unit === "lakhs") mult = 1e5;
  else if (unit === "cr" || unit === "crore" || unit === "crores") mult = 1e7;
  else if (unit === "m" || unit === "mn" || unit === "million") mult = 1e6;
  return Math.round(num * mult);
}

const ADD_INTENT = /\b(add|create|creating|new|start|save for|saving for|want|wanna|plan for|planning for|include|buy|buying|get|need a|i'?d like|set up)\b/;
const REMOVE_INTENT = /\b(remove|delete|drop|cancel|get rid of|take out|scrap)\b/;
const POOL_CONTEXT = /\b(invest|investing|sip|per month|a month|monthly|each month|\/mo|month|put away|set aside|contribute)\b/;
const CASH_CONTEXT = /\b(savings?|cash|in the bank|in bank|saved|i have|i've got|sitting|lump\s?sum|corpus)\b/;
const TARGET_CONTEXT = /\b(target|cost|costs?|worth|need|needs|needed|budget|goal amount|amount|to|=)\b/;

export function parseCommand(raw: string, now = new Date().getFullYear()): Command | null {
  const text = raw.toLowerCase().trim();
  if (!text) return null;

  const goal = findGoal(text);
  const amount = parseAmountINR(text);
  const hasPortfolioWord = /\b(portfolio|mix|allocation|funds?|investments?)\b/.test(text);

  // Re-tune the single portfolio to the goals.
  if (hasPortfolioWord && /\b(match|recommend|fix|suggest|optimi[sz]e|rebalance|re-balance|tune|adjust)\b/.test(text))
    return { kind: "recommendPortfolio" };

  // Auto-balance money across goals.
  if (/\bauto.?balance\b/.test(text)) return { kind: "autoSplit" };
  if (/\b(balance|split|distribute|spread|divide|allocate)\b/.test(text) && /\b(money|across goals|between goals|goals)\b/.test(text))
    return { kind: "autoSplit" };

  // Remove a goal.
  if (goal && REMOVE_INTENT.test(text)) return { kind: "removeGoal", ...goal };

  // Set a goal's timeline ("in 6 years", "by 2032").
  const byYear = text.match(/\bby\s+(20\d{2})\b/);
  const inYears = text.match(/\b(?:in|within|after|over)\s+(\d{1,2})\s*(?:years?|yrs?)\b/) || text.match(/\b(\d{1,2})\s*(?:years?|yrs?)\b/);
  if (goal && (byYear || inYears)) {
    const years = byYear ? Number(byYear[1]) - now : Number(inYears![1]);
    if (years > 0 && years <= 60) return { kind: "setYears", ...goal, years };
  }

  // Set a goal's target amount (a goal + a ₹ amount → set/auto-add that goal's target).
  if (goal && amount != null && (TARGET_CONTEXT.test(text) || ADD_INTENT.test(text) || /\bgoal\b/.test(text)))
    return { kind: "setTarget", ...goal, amount };
  if (goal && amount != null) return { kind: "setTarget", ...goal, amount };

  // Add a goal (explicit intent, or a "<goal> goal" mention).
  if (goal && (ADD_INTENT.test(text) || /\bgoal\b/.test(text))) return { kind: "addGoal", ...goal };

  // Monthly investing pool (amount + monthly context, no specific goal).
  if (amount != null && !goal && POOL_CONTEXT.test(text)) return { kind: "setPool", amount };

  // Cash in hand / bank (amount + cash context, no specific goal).
  if (amount != null && !goal && CASH_CONTEXT.test(text)) return { kind: "setCash", amount };

  // Start a fresh plan (no goal mentioned).
  if (!goal && /\b(new plan|start over|start fresh|fresh start|reset(?:\s+my)?(?:\s+plan)?|create a (?:new )?plan|make a (?:new )?plan|redo my plan)\b/.test(text))
    return { kind: "newPlan" };

  return null;
}
