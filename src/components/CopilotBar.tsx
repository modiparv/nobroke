import { useEffect, useRef, useState } from "react";
import { actions, useStore } from "../store";

/** Example prompts that show the copilot can DO things, not just answer. */
const SUGGESTIONS = [
  "Add a car goal",
  "I can invest ₹40k a month",
  "Set home target to ₹60L",
  "Buy a home in 6 years",
  "Auto-balance my money",
  "What's an emergency fund?",
];

function TypingDots() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm border border-line bg-surface-2 px-3.5 py-3">
      {[0, 0.2, 0.4].map((d, i) => (
        <span key={i} className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}

/**
 * The copilot — a persistent horizontal command bar. You can talk to it like a
 * person who's taking care of your goals: tell it to add a goal, set a target,
 * move money, or ask any general money question. Plan-changing intents are applied
 * instantly on-device; everything else is answered by the AI.
 */
export default function CopilotBar() {
  const s = useStore();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [s.chat.length, s.chatTyping]);

  const send = (t: string) => {
    if (!t.trim() || s.chatTyping) return;
    actions.submitCopilot(t);
    setText("");
  };
  const hasThread = s.chatOpen && (s.chat.length > 0 || s.chatTyping);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="pointer-events-auto mx-auto max-w-page px-6 pb-4">
        {/* Conversation — opens upward above the bar */}
        {hasThread && (
          <div className="mb-2 overflow-hidden rounded-2xl border border-line bg-surface">
            <header className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-xs font-medium text-white">N</span>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-support font-medium">
                  NoBroke copilot <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-positive" />
                </div>
                <div className="text-index uppercase tracking-wide text-muted">looking after your goals</div>
              </div>
              <button
                onClick={actions.closeChat}
                className="text-index uppercase tracking-wide text-muted transition hover:text-ink"
              >
                Clear
              </button>
              <button
                onClick={actions.collapseChat}
                aria-label="Collapse"
                className="grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                ↓
              </button>
            </header>
            <div ref={scrollRef} className="flex max-h-[48vh] flex-col gap-2 overflow-y-auto p-3">
              {s.chat.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <span
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-support leading-relaxed ${
                      m.role === "user"
                        ? "rounded-br-sm bg-brand text-white"
                        : "rounded-bl-sm border border-line bg-surface-2 text-ink"
                    }`}
                  >
                    {m.text}
                  </span>
                </div>
              ))}
              {s.chatTyping && (
                <div className="flex justify-start">
                  <TypingDots />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Suggestion chips — only while the bar is focused, so they don't block the page */}
        {focused && !hasThread && (
          <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                onMouseDown={(e) => {
                  e.preventDefault();
                  send(q);
                }}
                className="flex-none whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-caption font-medium text-ink transition hover:border-brand"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* The command bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="copilot-bar flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-2 py-1.5"
        >
          <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-brand text-sm text-white">
            ✨
          </span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => {
              setFocused(true);
              if (s.chat.length) actions.openChat();
            }}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            disabled={s.chatTyping}
            placeholder="Tell me to change a goal, or ask anything…"
            aria-label="Ask the NoBroke copilot"
            className="h-8 flex-1 bg-transparent text-body outline-none placeholder:text-muted disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!text.trim() || s.chatTyping}
            aria-label="Send"
            className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-brand text-base text-white transition hover:bg-brand-deep disabled:opacity-40"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
