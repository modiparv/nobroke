import type { ChatMessage } from "./types";

/** A plan action proposed by NoBroke AI. The client validates it again and
 *  executes it through the same deterministic engine as the command bar. */
export interface AiAction {
  kind: "addGoal" | "removeGoal" | "setPool" | "setCash" | "setTarget" | "setYears" | "autoSplit" | "recommendPortfolio";
  goalId?: string;
  amount?: number;
  years?: number;
}

export interface AiReply {
  text?: string;
  action?: AiAction;
}

/** Calls our own serverless proxy (/api/chat), which talks to Groq server-side. Never throws. */
export async function askGroq(history: ChatMessage[], planData: unknown | null): Promise<AiReply> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history, planData }),
    });
    const data = (await res.json().catch(() => null)) as AiReply | null;
    if (data && (data.action || (data.text && data.text.trim()))) return data;
    return { text: "Something went wrong. Try again." };
  } catch {
    return { text: "Something went wrong. Try again." };
  }
}
