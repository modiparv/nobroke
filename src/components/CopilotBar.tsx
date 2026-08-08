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
 * The copilot: a persistent command bar at the bottom, and a NoBroke AI
 * side panel for the conversation. You can talk to it like a
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

  // The command bar rides the bottom; the conversation opens as a right-side
  // NoBroke AI panel with its own input. One input at a time: the bar hides
  // while the panel is open.
  return (
    <>
      {hasThread && (
        <aside
          className="panel-slide fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface sm:max-w-[400px]"
          aria-label="NoBroke AI"
        >
          <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-control bg-night">
              <LogoMark size={15} />
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-support font-medium">
                NoBroke AI <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-positive" />
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
              aria-label="Close panel"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              ✕
            </button>
          </header>
          <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {s.chat.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <span
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-support leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-night text-on-night"
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
            className="flex items-center gap-1.5 border-t border-line p-2.5"
          >
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={s.chatTyping}
              placeholder="Tell me to change a goal, or ask anything…"
              aria-label="Ask NoBroke AI"
              className="h-9 flex-1 rounded-control bg-surface-2 px-3 text-body outline-none placeholder:text-muted disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!text.trim() || s.chatTyping}
              aria-label="Send"
              className="grid h-9 w-9 flex-none place-items-center rounded-control bg-brand text-base text-on-accent transition hover:bg-brand-deep disabled:opacity-40"
            >
              ↑
            </button>
          </form>
        </aside>
      )}

      {!hasThread && (
        <div className="pointer-events-none sticky bottom-0 z-40 w-full">
          <div className="pointer-events-auto mx-auto max-w-3xl px-4 pb-3 sm:px-6 sm:pb-4">
            {/* Suggestion chips — only while the bar is focused */}
            {focused && (
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
              <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-control bg-night text-sm text-on-night">
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
                aria-label="Ask NoBroke AI"
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
      )}
    </>
  );
}
