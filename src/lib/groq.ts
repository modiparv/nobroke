import Groq from "groq-sdk";
import type { ChatMessage } from "./types";

// llama-3.1-70b-versatile was decommissioned by Groq; 3.3 is the current drop-in.
export const GROQ_MODEL = "llama-3.3-70b-versatile";

let client: Groq | null = null;
function getClient(): Groq | null {
  const key = import.meta.env.VITE_GROQ_API_KEY;
  if (!key) return null;
  if (!client) client = new Groq({ apiKey: key, dangerouslyAllowBrowser: true });
  return client;
}

export function hasGroqKey(): boolean {
  return Boolean(import.meta.env.VITE_GROQ_API_KEY);
}

function systemPrompt(planData: unknown | null): string {
  return `You are NoBroke AI, a friendly personal finance assistant built for young Indians using the NoBroke app — a financial roadmap tool.

Answer two types of questions:
1. General finance questions — SIP, PPF, ELSS, mutual funds, FD, emergency funds, asset allocation etc. Use simple language, Indian context (₹, 80C, LTCG, Indian instruments). Be conversational.

2. Questions about the user's own plan — if plan data is provided in this context, use their actual numbers to give personalised answers.

Tone: like a smart friend who knows finance — not a corporate advisor. Keep responses concise. No generic disclaimers. If unsure, say so simply.

${planData ? `User's current plan: ${JSON.stringify(planData)}` : ""}`;
}

/** Calls Groq with the full conversation + optional plan context. Never throws. */
export async function askGroq(history: ChatMessage[], planData: unknown | null): Promise<string> {
  const groq = getClient();
  if (!groq) return "Add your Groq API key (VITE_GROQ_API_KEY) to a .env file and restart to switch me on.";
  const messages = [
    { role: "system", content: systemPrompt(planData) },
    ...history.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
  ];
  try {
    const res = await groq.chat.completions.create({
      model: GROQ_MODEL,
      // groq-sdk uses OpenAI-compatible message roles
      messages: messages as never,
      max_tokens: 1000,
    });
    return res.choices?.[0]?.message?.content?.trim() || "Hmm, I didn't catch that — mind rephrasing?";
  } catch (err) {
    console.error("Groq error", err);
    return "Something went wrong. Try again.";
  }
}
