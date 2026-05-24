import type { ChatMessage } from "./types";

/** Calls our own serverless proxy (/api/chat), which talks to Groq server-side. Never throws. */
export async function askGroq(history: ChatMessage[], planData: unknown | null): Promise<string> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history, planData }),
    });
    const data = (await res.json().catch(() => null)) as { text?: string } | null;
    const text = data?.text?.trim();
    return text || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}
