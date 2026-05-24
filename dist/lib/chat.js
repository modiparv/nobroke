import { categoryWeights, growthWeight } from "./finance.js";
import { CATEGORY_MAP } from "./assets.js";
import { formatINR, formatPct, formatYears } from "./format.js";
export const DEFAULT_QUICK_REPLIES = [
    "How am I doing?",
    "How do I reach it faster?",
    "Is my portfolio risky?",
    "Show all my goals",
];
/**
 * AURA — rule-based conversational layer. Deterministic today; the same
 * signature can front a Gemini/LLM call (the "Conversational AI" layer)
 * with `ctx` serialized as grounding. No user-facing data 0/1/2 jargon.
 */
export function auraGreeting(ctx) {
    const pct = Math.round(Math.min(1, ctx.result.progress) * 100);
    return {
        text: `Hey — I'm AURA, your finance match-maker. 💫 Right now you're about ${pct}% of the way to your ${ctx.goalName}. Ask me anything about your money.`,
        quickReplies: DEFAULT_QUICK_REPLIES,
    };
}
function has(msg, ...words) {
    return words.some((w) => msg.includes(w));
}
export function auraReply(message, ctx) {
    const m = message.toLowerCase().trim();
    const r = ctx.result;
    if (has(m, "hi", "hello", "hey", "yo", "sup")) {
        return { text: `Hey! 👋 Ready to talk about your ${ctx.goalName}? Pick a question below or type your own.`, quickReplies: DEFAULT_QUICK_REPLIES };
    }
    if (has(m, "thank", "thx", "ty ", "appreciate")) {
        return { text: `Anytime. 🙌 That's what a good match is for. What else is on your mind?`, quickReplies: DEFAULT_QUICK_REPLIES };
    }
    // Faster / close the gap / how much to invest
    if (has(m, "faster", "sooner", "reach", "gap", "catch", "increase", "how much should", "invest more", "close")) {
        if (r.onTrack) {
            return {
                text: `Good news — you're already on track for ${ctx.goalName}. To get there even sooner you could nudge your SIP above ${formatINR(ctx.inputs.monthlySip)}/mo, or shift slightly more into growth assets. Want me to show the risk trade-off?`,
                quickReplies: ["Is my portfolio risky?", "Show all my goals"],
            };
        }
        const extra = Math.max(0, r.requiredSip - ctx.inputs.monthlySip);
        return {
            text: `To hit ${ctx.goalName} on time, step your SIP up to about ${formatINR(r.requiredSip)}/mo — that's +${formatINR(extra)} from where you are. Stretching the deadline a bit or adding more growth assets also helps.`,
            quickReplies: ["Is my portfolio risky?", "How am I doing?"],
        };
    }
    // Status / progress
    if (has(m, "track", "how am i", "doing", "status", "where am i", "progress", "on course")) {
        const pct = Math.round(Math.min(1, r.progress) * 100);
        if (r.onTrack) {
            return {
                text: `You're on track 🎯 — projected ${formatINR(r.projectedCorpus)} vs a ${formatINR(r.requiredCorpus)} target (${pct}% of the way, with room to spare). Keep the SIP going and you'll get there.`,
                quickReplies: ["How do I reach it faster?", "Show all my goals"],
            };
        }
        return {
            text: `Right now you're at ~${pct}% of your ${ctx.goalName} target. Projected ${formatINR(r.projectedCorpus)} vs ${formatINR(r.requiredCorpus)} needed — a ${formatINR(Math.abs(r.gap))} gap. Totally fixable. Want the plan to close it?`,
            quickReplies: ["How do I reach it faster?", "Is my portfolio risky?"],
        };
    }
    // Return / XIRR
    if (has(m, "return", "xirr", "cagr", "interest", "grow my money", "growth rate")) {
        return {
            text: `Your mix is projected to earn about ${formatPct(r.blendedReturn)} a year (an XIRR of ${formatPct(r.xirr)} once compounding is counted). Of your projected ${formatINR(r.projectedCorpus)}, ${formatINR(r.projectedCorpus - r.totalInvested)} is pure growth.`,
            quickReplies: ["Is my portfolio risky?", "How am I doing?"],
        };
    }
    // Risk
    if (has(m, "risk", "safe", "volatil", "lose", "crash", "danger", "scary")) {
        const g = growthWeight(ctx.inputs.allocation);
        const risky = g > 0.6;
        return {
            text: `${formatPct(g, 0)} of your portfolio is in growth assets, with overall volatility around ${formatPct(r.blendedVolatility, 0)}. ${risky ? "That's punchy — great for long horizons, bumpy for short ones." : "That's fairly steady."} ${ctx.inputs.horizonYears <= 3 && risky ? "For a near-term goal I'd dial it down a touch." : "Looks reasonable for your timeline."}`,
            quickReplies: ["How do I reach it faster?", "How am I doing?"],
        };
    }
    // Portfolio / allocation
    if (has(m, "portfolio", "allocation", "mix", "diversif", "rebalance", "equity", "debt", "bond", "commodit", "mutual")) {
        const cw = categoryWeights(ctx.inputs.allocation);
        const parts = Object.entries(cw)
            .sort((a, b) => b[1] - a[1])
            .map(([id, w]) => `${formatPct(w, 0)} ${CATEGORY_MAP[id]?.name ?? id}`)
            .join(", ");
        return {
            text: parts ? `Your money is split: ${parts}. Drag products in the balancer to reshape it — I'll re-score everything instantly.` : `Your portfolio is empty — drag some assets into the balancer and I'll analyze the mix.`,
            quickReplies: ["Is my portfolio risky?", "How do I reach it faster?"],
        };
    }
    // All goals
    if (has(m, "goals", "all", "other goal", "which goal", "everything", "overview")) {
        if (ctx.allGoals.length <= 1) {
            return { text: `You're focused on ${ctx.goalName} right now. Add more goals from the dashboard and I'll track each one for you.`, quickReplies: DEFAULT_QUICK_REPLIES };
        }
        const lines = ctx.allGoals
            .map((g) => `${g.emoji} ${g.name}: ${Math.round(Math.min(1, g.progress) * 100)}% ${g.onTrack ? "✓" : ""}`)
            .join("  ·  ");
        return { text: `Here's the whole picture — ${lines}. Tap any goal up top to dive in.`, quickReplies: ["How am I doing?", "How do I reach it faster?"] };
    }
    // Inflation
    if (has(m, "inflation", "worth", "future cost", "expensive")) {
        return {
            text: `I plan for the future price, not today's. Your ${formatINR(ctx.inputs.targetToday)} goal works out to ${formatINR(r.requiredCorpus)} in ${formatYears(ctx.inputs.horizonYears)} after inflation — that's the number we actually aim for.`,
            quickReplies: ["How am I doing?", "How do I reach it faster?"],
        };
    }
    // Definitions
    if (has(m, "what is", "explain", "mean", "define", "how does")) {
        if (has(m, "xirr"))
            return { text: `XIRR is your real annualized return once the timing of every contribution is counted — the honest "what did my money actually earn" number.`, quickReplies: DEFAULT_QUICK_REPLIES };
        if (has(m, "sip"))
            return { text: `A SIP is a fixed amount you invest every month, automatically. Small and steady beats lump-sum timing for most people.`, quickReplies: DEFAULT_QUICK_REPLIES };
        if (has(m, "equity"))
            return { text: `Equity = owning a slice of companies. Highest long-run growth, but it swings. Best when your goal is years away.`, quickReplies: DEFAULT_QUICK_REPLIES };
        if (has(m, "debt") || has(m, "bond"))
            return { text: `Debt & bonds are loans you make to govts/companies for steady interest. Lower returns, much smoother — your portfolio's shock absorber.`, quickReplies: DEFAULT_QUICK_REPLIES };
        return { text: `Ask me to explain XIRR, SIP, equity, debt, bonds or commodities — I'll keep it jargon-free.`, quickReplies: DEFAULT_QUICK_REPLIES };
    }
    // Fallback
    return {
        text: `I've got you. I can break down where you stand on ${ctx.goalName}, how to get there faster, or how risky your mix is. Try one of these:`,
        quickReplies: DEFAULT_QUICK_REPLIES,
    };
}
//# sourceMappingURL=chat.js.map