import Groq from "groq-sdk";

// Vercel serverless function. The Groq key stays server-side (process.env.GROQ_API_KEY)
// and is never shipped to the browser. llama-3.1-70b-versatile was decommissioned; 3.3 is current.
const MODEL = "llama-3.3-70b-versatile";

interface InMsg {
  role?: string;
  text?: string;
}

function systemPrompt(planData: unknown): string {
  return `You are NoBroke AI, a friendly personal finance assistant built for young Indians using the NoBroke app — a financial roadmap tool.

Answer two types of questions:
1. General finance questions — SIP, PPF, ELSS, mutual funds, FD, emergency funds, asset allocation etc. Use simple language, Indian context (₹, 80C, LTCG, Indian instruments). Be conversational.

2. Questions about the user's own plan — if plan data is provided in this context, use their actual numbers to give personalised answers.

Tone: like a smart friend who knows finance — not a corporate advisor. Keep responses concise. No generic disclaimers. If unsure, say so simply.

${planData ? `User's current plan: ${JSON.stringify(planData)}` : ""}`;
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
      ...history.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: String(m.text ?? "") })),
    ];
    const groq = new Groq({ apiKey: key });
    const r = await groq.chat.completions.create({ model: MODEL, messages: messages as never, max_tokens: 1000 });
    res.status(200).json({ text: r.choices?.[0]?.message?.content?.trim() || "Hmm, I didn't catch that — mind rephrasing?" });
  } catch (err) {
    console.error("groq proxy error", err);
    res.status(200).json({ text: "Something went wrong. Try again." });
  }
}
