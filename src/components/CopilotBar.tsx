import { useEffect, useRef, useState } from "react";
import { actions, useStore } from "../store";
import { LogoMark } from "./Logo";

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
    <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm bg-surface-2 px-3.5 py-3">
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

  // Sticky, not fixed: the bar rides the bottom of the viewport while you
  // scroll, but at the end of the page it settles into its own flow slot —
  // combined with the 88px bottom padding on each tab's content, nothing can
  // ever sit underneath it at any scroll position.
  return (
    <div className="pointer-events-none sticky bottom-0 z-40 w-full">
      <div className="pointer-events-auto mx-auto max-w-3xl px-4 pb-3 sm:px-6 sm:pb-4">
        {/* Conversation — opens upward above the bar */}
        {hasThread && (
          <div className="mb-2 overflow-hidden rounded-card border border-line bg-surface">
            <header className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-control bg-band">
                <LogoMark size={15} />
              </span>
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
                        ? "rounded-br-sm bg-band text-on-band"
                        : "rounded-bl-sm bg-surface-2 text-ink"
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
                className="flex-none whitespace-nowrap rounded-full bg-surface-2 px-3 py-1.5 text-caption font-medium text-ink transition hover:bg-line"
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
          className="copilot-bar flex items-center gap-1.5 rounded-card border border-line bg-surface px-2 py-1.5"
        >
          <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-control bg-band text-sm text-on-band">
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
            className="grid h-8 w-8 flex-none place-items-center rounded-control bg-brand text-base text-on-accent transition hover:bg-brand-deep disabled:opacity-40"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
