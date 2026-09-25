/**
 * Natural-language → action layer for the copilot bar. Self-contained (no imports)
 * so it can be unit-tested in isolation. It recognises the common "change my plan"
 * intents on-device so the copilot can actually DO things; anything it can't parse
 * falls through to the AI for a general answer.
 *
 * The bar acts only when it is sure. A number is money only when it is marked
 * as money (₹, rs, or a unit like k, lakh, crore) or is a bare number of at
 * least ₹500: the 16 in "iphone 16", the 8 in "8 months" and the 4 in "4
 * friends" are never amounts. A sentence with two amounts, or one about what
 * comes in or goes out rather than what to invest, goes to the AI, which can
 * ask which is which.
 */
export type Command =
  | { kind: "addGoal"; goalId: string; name: string }
  | { kind: "removeGoal"; goalId: string; name: string }
  | { kind: "setPool"; amount: number }
  | { kind: "setCash"; amount: number }
  | { kind: "setTarget"; goalId: string; name: string; amount: number }
  | { kind: "setYears"; goalId: string; name: string; years: number; note?: string }
  /** "trip 25k in 10 months": an amount and a date in one breath, both applied. */
  | { kind: "setTargetAndYears"; goalId: string; name: string; amount: number; years: number; note?: string }
  | { kind: "autoSplit" }
  | { kind: "recommendPortfolio" }
  | { kind: "newPlan" };

// Loose keyword → { id, display name } map (ids match src/lib/goals.ts).
// Order matters where words overlap: "education loan" is a loan, "kid's
// college" is the child's education, a "course" is not "study abroad", so
// the narrower goals sit before the wider ones.
const GOAL_KEYWORDS: Array<{ re: RegExp; id: string; name: string }> = [
  { re: /\b(safety net|safety|emergency|rainy day)\b/, id: "emergency", name: "Emergency fund" },
  { re: /\b(travel|trip|vacation|holiday)\b/, id: "travel", name: "Big trip" },
  { re: /\b(gadget|tech|phone|laptop|iphone|macbook)\b/, id: "gadget", name: "New phone or laptop" },
  { re: /\b(loan|pay ?off|debt free|debt-free)\b/, id: "loan", name: "Pay off a loan" },
  { re: /\b(bike|scooter|scooty|activa|two.?wheeler|motorcycle)\b/, id: "bike", name: "Bike or scooter" },
  { re: /\b(car|vehicle|four.?wheeler)\b/, id: "car", name: "First car" },
  { re: /\b(wedding|marriage|shaadi)\b/, id: "wedding", name: "Wedding" },
  { re: /\b(home|house|flat|apartment|property|down ?payment)\b/, id: "home", name: "Home down payment" },
  { re: /\b(parents?|mom|dad|mother|father|maa|papa)\b/, id: "parents", name: "Parents' care" },
  { re: /\b(business|startup|venture)\b/, id: "business", name: "Start something" },
  { re: /\b(child|children|kids?|son|daughter|baby)\b/, id: "child", name: "Child's education" },
  { re: /\b(college|fees|semester|tuition|hostel)\b/, id: "college", name: "College fees" },
  { re: /\b(course|upskill|bootcamp|certification|certificate|skill)\b/, id: "course", name: "Upskill or a course" },
  { re: /\b(education|study|degree|masters|abroad|university)\b/, id: "education", name: "Study abroad" },
  { re: /\b(retire|retirement|fire)\b/, id: "fire", name: "Retire early" },
  { re: /\b(financial freedom|freedom|independence)\b/, id: "freedom", name: "Financial freedom" },
];

function findGoal(text: string): { goalId: string; name: string } | null {
  for (const g of GOAL_KEYWORDS) if (g.re.test(text)) return { goalId: g.id, name: g.name };
  return null;
}

const UNIT_MULT: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  l: 1e5,
  lac: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
};

/** The smallest bare number (no ₹, no unit) the bar reads as money. */
const BARE_MINIMUM = 500;

/** A number followed by one of these is a duration, a count or an ordinal, not money. */
const NOT_MONEY_AFTER =
  /^\s*(?:months?|mos?|weeks?|wks?|days?|years?|yrs?|hours?|hrs?|friends?|people|persons?|guys|kids?|nights?|times|x|%|percent|th|st|nd|rd)\b/;
/** A bare 20xx is a calendar year, unless it is plainly a monthly amount. */
const MONTHLY_AFTER = /^\s*(?:a month|per month|monthly|each month|every month|\/\s*mo(?:nth)?)\b/;
const YEAR_LIKE = /^20[2-9]\d$/;

// A number not glued to a word or a dot on its left (so "m3" and "3.5" stay
// whole), optionally marked with ₹ or rs and followed by a unit.
const AMOUNT_RE = /(?<![\w.])(₹\s*|rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*(k|thousand|l|lac|lakh|lakhs|cr|crore|crores|m|mn|million)\b)?/g;

/** Every number in the text that can honestly be read as rupees, in order. */
export function amountsINR(text: string): number[] {
  const t = text.toLowerCase();
  const out: number[] = [];
  for (const m of t.matchAll(AMOUNT_RE)) {
    const marker = !!m[1];
    const raw = m[2];
    const unit = m[3];
    const rest = t.slice((m.index ?? 0) + m[0].length);
    // Glued to a word on the right: 16gb, 3000km, 16th.
    if (!unit && /^[a-z]/.test(rest)) continue;
    if (NOT_MONEY_AFTER.test(rest)) continue;
    const num = parseFloat(raw.replace(/,/g, ""));
    if (!Number.isFinite(num) || num <= 0) continue;
    if (!marker && !unit) {
      if (YEAR_LIKE.test(raw) && !MONTHLY_AFTER.test(rest)) continue;
      if (num < BARE_MINIMUM) continue;
    }
    out.push(Math.round(num * (unit ? UNIT_MULT[unit] : 1)));
  }
  return out;
}

/** The one amount in the text, or null when there is none or more than one. */
export function parseAmountINR(text: string): number | null {
  const amounts = amountsINR(text);
  return amounts.length === 1 ? amounts[0] : null;
}

const ADD_INTENT = /\b(add|create|creating|new|start|save for|saving for|want|wanna|plan for|planning for|include|buy|buying|get|need a|i'?d like|set up)\b/;
const REMOVE_INTENT = /\b(remove|delete|drop|cancel|get rid of|take out|scrap)\b/;
const POOL_CONTEXT = /\b(invest|investing|sip|per month|a month|monthly|each month|\/mo|month|put away|set aside|contribute)\b/;
const CASH_CONTEXT = /\b(savings?|cash|in the bank|in bank|saved|i have|i've got|sitting|lump\s?sum|corpus)\b/;
const TARGET_CONTEXT = /\b(target|cost|costs?|worth|need|needs|needed|budget|goal amount|amount|to|=)\b/;

/** What comes in or goes out is a fact about the person, not an instruction
    to invest: "i get 8000 pocket money a month" must never set the monthly
    investment to ₹8,000. The AI reads these and answers. */
const INCOME_CONTEXT = /\b(salary|stipend|pocket money|allowance|earn|earns|earning|earnings|income|get paid|paid|gives? me|give me|got from)\b/;
// "fees" is not here: college fees are a goal, not a spend.
const SPEND_CONTEXT = /\b(spent|spend|spends|spending|expenses?|bills?|rent|kharcha|kharch)\b/;
/** A gift for mom is not Parents' care; the AI reads these and answers. */
const GIFT_CONTEXT = /\b(gifts?|presents?|birthday|anniversary|treat)\b/;

/** Interrogatives that mark a QUESTION, which must never mutate the plan —
    "explain the safety net goal" or "should I rebalance?" go to the AI.
    Polite-command openers ("can you add…", "please add…") stay commands. */
const QUESTION_START = /^(what|why|how|when|which|where|who|is|are|am|do|does|did|should|could|would|can|will|explain|tell me)\b/;
const POLITE_COMMAND = /^(can you|could you|would you|will you|please)\b/;

export function parseCommand(raw: string, now = new Date().getFullYear()): Command | null {
  const text = raw.toLowerCase().trim();
  if (!text) return null;

  // Questions are answered, never executed.
  if ((QUESTION_START.test(text) || text.endsWith("?")) && !POLITE_COMMAND.test(text)) return null;

  // Two amounts in one breath ("laptop 70k and trip 20k"), or a sentence about
  // income or spending: the AI sorts out which number is which.
  const amounts = amountsINR(text);
  if (amounts.length > 1) return null;
  if (INCOME_CONTEXT.test(text) || SPEND_CONTEXT.test(text) || GIFT_CONTEXT.test(text)) return null;
  const amount = amounts[0] ?? null;

  const goal = findGoal(text);
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

  // Set a goal's timeline: "in 6 years", "by 2032", "in 2027", "2032 tak",
  // "in 8 months". The plan works in whole years, so months round and the
  // confirmation says so. With an amount in the same breath ("trip 25k in
  // 10 months") both are applied, never just the date.
  const yearMatch = text.match(/\b(20[2-9]\d)\b/);
  const yearMention =
    yearMatch && !MONTHLY_AFTER.test(text.slice((yearMatch.index ?? 0) + yearMatch[0].length)) ? Number(yearMatch[1]) : null;
  const inYears = text.match(/\b(?:in|within|after|over)\s+(\d{1,2})\s*(?:years?|yrs?)\b/) || text.match(/\b(\d{1,2})\s*(?:years?|yrs?)\b/);
  const inMonths = text.match(/\b(?:in|within|after|over)\s+(\d{1,2})\s*(?:months?|mos?)\b/) || text.match(/\b(\d{1,2})\s*months?\b/);
  if (goal) {
    let years: number | null = null;
    let note: string | undefined;
    if (yearMention != null) {
      years = yearMention - now;
    } else if (inYears) {
      years = Number(inYears[1]);
    } else if (inMonths) {
      const months = Number(inMonths[1]);
      if (months > 0) {
        years = Math.max(1, Math.round(months / 12));
        if (months % 12) note = `${months} months rounds to ${years} ${years === 1 ? "year" : "years"}; the plan works in whole years.`;
      }
    }
    if (years != null && years > 0 && years <= 60) {
      const when = note ? { years, note } : { years };
      if (amount != null) return { kind: "setTargetAndYears", ...goal, amount, ...when };
      return { kind: "setYears", ...goal, ...when };
    }
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
