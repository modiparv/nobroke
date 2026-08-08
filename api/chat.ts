import Groq from "groq-sdk";

// Vercel serverless function. The Groq key stays server-side (process.env.GROQ_API_KEY)
// and is never shipped to the browser.
const MODEL = "llama-3.3-70b-versatile";

/**
 * NoBroke AI, layer 2: the model is the natural-language layer ONLY. It may
 * answer grounded questions, or PROPOSE one of the fixed plan actions below —
 * which the client executes through the same deterministic engine as the
 * command bar. The model never computes money math and never mutates state.
 *
 * Canonical goal ids mirror src/lib/goals.ts and must stay in sync with it.
 */
const GOAL_IDS = [
  "emergency",
  "travel",
  "gadget",
  "car",
  "wedding",
  "home",
  "business",
  "education",
  "fire",
  "freedom",
] as const;

const GOAL_LABELS =
  "emergency=Safety Net, travel=Travel the World, gadget=New Tech, car=Dream Car, wedding=Dream Wedding, home=First Home, business=Start a Business, education=Study / Upskill, fire=Early Retirement, freedom=Financial Freedom";

const goalParam = {
  type: "string",
  enum: [...GOAL_IDS],
  description: `Which goal. Ids map to names: ${GOAL_LABELS}`,
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "set_goal_target",
      description: "Set a goal's target amount in today's rupees. Adds the goal first if it is not in the plan yet.",
      parameters: {
        type: "object",
        properties: { goal_id: goalParam, amount_inr: { type: "number", description: "Target amount in INR" } },
        required: ["goal_id", "amount_inr"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_goal_timeline",
      description: "Set how many years away a goal is. If the user gives a calendar year, convert to years from now.",
      parameters: {
        type: "object",
        properties: { goal_id: goalParam, years: { type: "number", description: "Whole years from now, 1 to 60" } },
        required: ["goal_id", "years"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_goal",
      description: "Add a goal to the plan.",
      parameters: { type: "object", properties: { goal_id: goalParam }, required: ["goal_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_goal",
      description: "Remove a goal from the plan.",
      parameters: { type: "object", properties: { goal_id: goalParam }, required: ["goal_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_monthly_investment",
      description: "Set the total amount the user invests per month across all goals.",
      parameters: {
        type: "object",
        properties: { amount_inr: { type: "number", description: "Monthly amount in INR" } },
        required: ["amount_inr"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_cash",
      description: "Set the user's cash in hand / bank savings.",
      parameters: {
        type: "object",
        properties: { amount_inr: { type: "number", description: "Amount in INR" } },
        required: ["amount_inr"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "auto_balance",
      description: "Automatically re-share the monthly investment across the plan's goals.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_portfolio",
      description: "Re-tune the single portfolio mix to the goals' timelines and the user's risk appetite.",
      parameters: { type: "object", properties: {} },
    },
  },
];

/** Tool name → client action kind (mirrors the Command union in src/lib/command.ts). */
const TOOL_TO_KIND: Record<string, string> = {
  set_goal_target: "setTarget",
  set_goal_timeline: "setYears",
  add_goal: "addGoal",
  remove_goal: "removeGoal",
  set_monthly_investment: "setPool",
  set_cash: "setCash",
  auto_balance: "autoSplit",
  recommend_portfolio: "recommendPortfolio",
};

function systemPrompt(planData: unknown): string {
  return `You are NoBroke AI, the assistant inside NoBroke — a goal-based financial planning app for India. Today's year: ${new Date().getFullYear()}.

WHAT YOU DO
1. Answer personal-finance questions in simple language with Indian context (₹, SIP, PPF, ELSS, EPF, FD, 80C, LTCG). Short answers: 2 to 6 sentences.
2. Answer questions about the user's own plan using ONLY the plan context below. If a number is not in the context, say you don't have it — never estimate or invent plan numbers.
3. When the user asks to CHANGE the plan (a target, a timeline, monthly amount, cash, add/remove a goal, rebalance), call the matching tool. The app applies it deterministically and shows its own confirmation — so when you call a tool, do not also write a message.

HARD RULES
- Never recommend specific stocks, crypto, F&O, or market timing. Decline plainly and steer back to the plan.
- Never compute projections yourself; the app's engine does all money math.
- You give education using the user's numbers, not personalised investment advice; don't present it as advice.
- If the request is ambiguous (which goal? how much?), ask one short clarifying question instead of guessing.

${planData ? `USER'S PLAN (source of truth): ${JSON.stringify(planData)}` : "No plan context available: answer general questions only, and say you can't see their plan if asked about it."}`;
}

interface InMsg {
  role?: string;
  text?: string;
}

/** Validate a proposed tool call into a safe client action, or null. */
function toAction(name: string, rawArgs: string): Record<string, unknown> | null {
  const kind = TOOL_TO_KIND[name];
  if (!kind) return null;
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return null;
  }
  const action: Record<string, unknown> = { kind };

  if (["setTarget", "setYears", "addGoal", "removeGoal"].includes(kind)) {
    const goalId = String(args.goal_id ?? "");
    if (!(GOAL_IDS as readonly string[]).includes(goalId)) return null;
    action.goalId = goalId;
  }
  if (["setTarget", "setPool", "setCash"].includes(kind)) {
    const amount = Math.round(Number(args.amount_inr));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return null;
    action.amount = amount;
  }
  if (kind === "setYears") {
    const years = Math.round(Number(args.years));
    if (!Number.isFinite(years) || years < 1 || years > 60) return null;
    action.years = years;
  }
  return action;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ text: "Method not allowed" });
    return;
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    res.status(200).json({ text: "NoBroke AI isn't switched on yet — add GROQ_API_KEY in Vercel and redeploy." });
    return;
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const history: InMsg[] = Array.isArray(body.history) ? body.history : [];
    const messages = [
      { role: "system", content: systemPrompt(body.planData ?? null) },
      ...history.slice(-20).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: String(m.text ?? "") })),
    ];
    const groq = new Groq({ apiKey: key });
    const r = await groq.chat.completions.create({
      model: MODEL,
      messages: messages as never,
      tools: TOOLS as never,
      tool_choice: "auto",
      max_tokens: 700,
      temperature: 0.4,
    });
    const msg = r.choices?.[0]?.message;
    const call = msg?.tool_calls?.[0];
    if (call?.function?.name) {
      const action = toAction(call.function.name, call.function.arguments ?? "");
      if (action) {
        res.status(200).json({ action });
        return;
      }
      res.status(200).json({ text: "I couldn't apply that safely — mind saying it with the goal and the amount?" });
      return;
    }
    res.status(200).json({ text: msg?.content?.trim() || "Hmm, I didn't catch that — mind rephrasing?" });
  } catch (err) {
    console.error("groq proxy error", err);
    res.status(200).json({ text: "Something went wrong. Try again." });
  }
}
