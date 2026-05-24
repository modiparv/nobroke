import type { PlanInputs, PlanResult } from "./types";
import { formatINR, formatPct, formatYears } from "./format";
import { growthWeight } from "./finance";

export const STARTERS = [
  "What is a SIP?",
  "How do I build an emergency fund?",
  "Which is better — PPF or ELSS?",
  "Explain my plan to me",
];

export interface ChatGoalStatus {
  name: string;
  emoji: string;
  progress: number;
  onTrack: boolean;
}

export interface ChatPlanContext {
  goalName: string;
  result: PlanResult;
  inputs: PlanInputs;
  allGoals: ChatGoalStatus[];
  suggestedSip: number;
}

const GREETING =
  "Hey — I'm NoBroke AI. Ask me anything about money: SIPs, PPF vs ELSS, emergency funds, or your own plan. No jargon, promise.";

export function aiGreeting(): string {
  return GREETING;
}

function has(m: string, ...words: string[]): boolean {
  return words.some((w) => m.includes(w));
}

/**
 * Rule-based responder. Deterministic today; swap the body for an Anthropic
 * Messages API call (system prompt + history + plan context) when a key is wired.
 */
export function aiReply(message: string, ctx: ChatPlanContext | null): string {
  const m = message.toLowerCase().trim();

  if (has(m, "hi", "hello", "hey", "yo ")) {
    return "Hey! What's on your mind — a finance concept, or your own plan?";
  }
  if (has(m, "thank", "thanks", "thx")) {
    return "Anytime. That's what I'm here for.";
  }

  // ---- General finance ----
  if (has(m, "what is a sip", "what is sip", "what's a sip", "explain sip", "sip mean")) {
    return "A SIP (Systematic Investment Plan) is just investing a fixed amount every month — say ₹5,000 — automatically into a mutual fund. Two reasons it works: you buy more units when markets dip (rupee-cost averaging), and you never have to time the market. Start small, automate it, increase it as your income grows.";
  }
  if (has(m, "emergency fund", "emergency", "safety net", "rainy day")) {
    return "An emergency fund = 3–6 months of expenses kept somewhere safe and instant-access. Quick plan:\n• Target: monthly expenses × 6\n• Park it in a liquid fund or a sweep-in FD (not equity — it must not fall when you need it)\n• Build it before you chase higher-return goals\nIt's the seatbelt that lets you take risk elsewhere.";
  }
  if (has(m, "ppf") && has(m, "elss")) {
    return "Different tools, both 80C:\n• PPF — govt-backed, ~7.1%, fully tax-free, 15-yr lock-in. Zero risk, slow growth.\n• ELSS — equity mutual fund, higher long-run returns, 3-yr lock-in (shortest under 80C), but it swings with the market.\nRule of thumb: ELSS if your goal is 5+ years away and you can stomach ups and downs; PPF for the safe, guaranteed core. Most people do some of both.";
  }
  if (has(m, "elss")) {
    return "ELSS is an equity mutual fund that also saves tax under Section 80C (up to ₹1.5L/yr). It has the shortest lock-in of any 80C option — just 3 years — and historically beats PPF/FD over the long run, but returns aren't guaranteed. Good for tax-saving + long-term growth in one.";
  }
  if (has(m, "ppf")) {
    return "PPF (Public Provident Fund) is a govt-backed savings scheme: ~7.1% interest, completely tax-free, 15-year lock-in, up to ₹1.5L/yr under 80C. It's about as safe as it gets — great for the guaranteed, sleep-well part of your portfolio.";
  }
  if (has(m, "mutual fund", "what is a fund", "mutual funds")) {
    return "A mutual fund pools money from many people and a professional manager invests it across stocks/bonds. You get instant diversification for as little as ₹500/month. Flavours: equity (growth, volatile), debt (steady), hybrid (a mix), and index funds (track the market at near-zero cost — a great default).";
  }
  if (has(m, "fixed deposit", " fd", "fd ", "what is fd")) {
    return "An FD (Fixed Deposit) locks money with a bank for a set term at a guaranteed rate (~6.5–7.5%). Zero risk, fully predictable — but returns barely beat inflation and gains are taxed at your slab. Great for short-term goals and your emergency buffer; not ideal for long-term wealth.";
  }
  if (has(m, "asset allocation", "allocation", "diversif", "how should i invest", "where to invest")) {
    return "Asset allocation = how you split money across equity, debt and gold. The simplest guide is your time horizon:\n• Short goal (<3 yrs): mostly debt + a little gold\n• Medium (3–7 yrs): balanced mix\n• Long (7+ yrs): equity-heavy for growth\nDiversifying across these smooths the ride. The drag-and-drop basket here does exactly this — try it.";
  }
  if (has(m, "ltcg", "capital gains", "tax on", "taxed")) {
    return "Quick tax view (equity): gains under ₹1.25L/yr are tax-free; above that, long-term gains (held >1 yr) are taxed at 12.5%, short-term at 20%. Debt fund gains are taxed at your income slab. ELSS and PPF help on the 80C side. Not tax advice — check specifics for your case.";
  }
  if (has(m, "how much should i invest", "how much to invest", "how much do i need to save")) {
    if (ctx) {
      return `For ${ctx.goalName}, aim for about ${formatINR(ctx.result.requiredSip)}/mo given your timeline and mix. Based on your income, a comfortable starting SIP is around ${formatINR(ctx.suggestedSip)}/mo — automate it and step it up each year.`;
    }
    return "A good rule: invest at least 20% of your take-home, and bump it whenever your income rises. The exact number depends on your goals and timeline — build a plan and I'll give you a precise figure.";
  }

  // ---- Plan-aware ----
  if (ctx) {
    const r = ctx.result;
    if (has(m, "explain my plan", "my plan", "explain the plan", "break down")) {
      return `Here's your ${ctx.goalName} plan:\n• Target: ${formatINR(r.requiredCorpus)} (inflation-adjusted)\n• On current course you'll reach ${formatINR(r.projectedCorpus)}\n• That's ${r.onTrack ? `on track with a ${formatINR(r.gap)} cushion` : `a ${formatINR(Math.abs(r.gap))} shortfall`}\n• Blended return ~${formatPct(r.blendedReturn)}, projected XIRR ${formatPct(r.xirr)}\n${r.onTrack ? "Keep the SIP going and you're set." : `Bump your SIP to about ${formatINR(r.requiredSip)}/mo to close the gap.`}`;
    }
    if (has(m, "on track", "am i ok", "how am i", "doing", "track")) {
      const pct = Math.round(Math.min(1, r.progress) * 100);
      return r.onTrack
        ? `You're on track for ${ctx.goalName} — projected ${formatINR(r.projectedCorpus)} vs a ${formatINR(r.requiredCorpus)} target (${pct}% of the way, with room to spare).`
        : `You're at about ${pct}% of your ${ctx.goalName} target — projected ${formatINR(r.projectedCorpus)} vs ${formatINR(r.requiredCorpus)} needed. Totally fixable: step your SIP up to ~${formatINR(r.requiredSip)}/mo.`;
    }
    if (has(m, "afford", "earlier", "sooner", "faster", "speed up")) {
      return `To hit ${ctx.goalName} sooner you've got three levers: invest more each month (toward ${formatINR(r.requiredSip)}+/mo), add a bit more equity for higher expected growth, or give the goal a little more time. Want me to show what a higher SIP does to the date?`;
    }
    if (has(m, "prioritise", "prioritize", "which goal", "which one", "first")) {
      if (ctx.allGoals.length <= 1) {
        return `Right now you're focused on ${ctx.goalName}. Add a couple more goals and I'll help you sequence them.`;
      }
      const sorted = [...ctx.allGoals].sort((a, b) => a.progress - b.progress);
      const lines = sorted.map((g) => `• ${g.emoji} ${g.name}: ${Math.round(Math.min(1, g.progress) * 100)}%${g.onTrack ? " ✓" : ""}`).join("\n");
      return `Fund your safety net first, then the goal that's furthest behind. Here's where each stands:\n${lines}`;
    }
    if (has(m, "risk", "safe", "volatil", "lose", "crash")) {
      const g = growthWeight(ctx.inputs.allocation);
      return `${formatPct(g, 0)} of your ${ctx.goalName} mix is in equity, with overall volatility around ${formatPct(r.blendedVolatility, 0)}. ${g > 0.6 ? "That's punchy — great for long horizons, bumpy short-term." : "That's fairly steady."}`;
    }
    if (has(m, "return", "xirr", "grow")) {
      return `Your ${ctx.goalName} mix is projected to earn about ${formatPct(r.blendedReturn)} a year (XIRR ${formatPct(r.xirr)}). Of the projected ${formatINR(r.projectedCorpus)}, ${formatINR(r.projectedCorpus - r.totalInvested)} is growth on top of what you put in.`;
    }
  } else if (has(m, "my plan", "on track", "explain my plan", "afford", "prioritise", "prioritize")) {
    return "Once you build a plan (tap “Find your match” or “Explore the demo”), I can answer that with your actual numbers — how far along you are, what to prioritise, and how to get there faster.";
  }

  return "I can break down finance concepts (SIP, PPF, ELSS, mutual funds, FDs, asset allocation, tax) or your own plan once it's set up. Try one of the suggestions, or ask in your own words.";
}
