import { useEffect, useRef, useState } from "react";
import { useIsPhone } from "../lib/usePhone";
import { actions, useStore } from "../store";
import { LogoMark } from "./Logo";

/** Example prompts that show the copilot can DO things, not just answer.
 *  Commands are understood on the device and work for everyone. Questions
 *  go to the model, which answers only a signed-in person, so the question
 *  chip and the "ask anything" hint are shown only when signed in. */
const COMMANDS = ["Add a car goal", "I can invest ₹40k a month", "Set home target to ₹60L", "Buy a home in 6 years", "Auto-balance my money"];
const QUESTIONS = ["What's an emergency fund?"];
export const copilotSuggestions = (signedIn: boolean) => (signedIn ? [...COMMANDS, ...QUESTIONS] : COMMANDS);
export const copilotPlaceholder = (signedIn: boolean) =>
  signedIn ? "Tell me to change a goal, or ask anything…" : "Tell me to change a goal…";

/** The typed text is 16px, so an iPhone does not zoom the page on focus. */
const field = "h-11 min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-2 disabled:opacity-60";
/** Send is an ink control once there is something to send, and a quiet
    grey square until then. */
const sendButton =
  "grid h-11 w-11 flex-none place-items-center rounded-control bg-accent-fill text-on-accent transition-colors hover:bg-accent-fill-hi disabled:bg-surface-2 disabled:text-text-3";

/** The mark on a pale tile: both of its strokes stay visible there. */
function Mark() {
  return (
    <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-control bg-surface-2">
      <LogoMark size={18} />
    </span>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 13V3.5M3.75 7.5L8 3.25l4.25 4.25" />
    </svg>
  );
}

/** Shown while a reply is on its way. The dots stand still when the person
    has asked for less motion; the words are there for a screen reader. */
function TypingDots() {
  return (
    <div role="status" className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-4">
      {[0, 0.2, 0.4].map((d, i) => (
        <span
          key={i}
          aria-hidden
          className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-text-2 motion-reduce:!animate-none"
          style={{ animationDelay: `${d}s` }}
        />
      ))}
      <span className="sr-only">NoBroke AI is replying</span>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const hasThread = s.chatOpen && (s.chat.length > 0 || s.chatTyping);
  // A phone's field is too narrow for the longer hint, and a cut-off hint
  // helps nobody. There the short one shows for everyone; the question a
  // signed-in person can ask is still among the examples.
  const phone = useIsPhone();
  const placeholder = copilotPlaceholder(!!s.user && !phone);

  // "/" focuses the copilot from anywhere on the plan, unless the person is
  // already typing somewhere. Escape puts the open conversation away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && hasThread) return actions.collapseChat();
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasThread]);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [s.chat.length, s.chatTyping]);

  const send = (t: string) => {
    if (!t.trim() || s.chatTyping) return;
    actions.submitCopilot(t);
    setText("");
  };

  // The command bar rides the bottom; the conversation opens as a right-side
  // NoBroke AI panel with its own input. One input at a time: the bar hides
  // while the panel is open.
  return (
    <>
      {hasThread && (
        <aside
          className="panel-slide fixed inset-y-0 right-0 z-40 flex w-full flex-col border-line bg-surface sm:max-w-[420px] sm:border-l"
          aria-label="NoBroke AI"
        >
          {/* As tall as the app's own bar (56px and its hairline), so the two bottom edges line up. */}
          <header className="flex h-[3.5625rem] flex-none items-center gap-2.5 border-b border-line pl-4 pr-1.5">
            <Mark />
            <h2 className="min-w-0 flex-1 truncate text-row font-medium text-text">NoBroke AI</h2>
            <button
              type="button"
              onClick={actions.closeChat}
              className="inline-flex h-11 flex-none items-center whitespace-nowrap rounded-control px-2.5 text-support text-text-2 transition-colors hover:text-text"
            >
              Clear chat
            </button>
            <button
              type="button"
              onClick={actions.collapseChat}
              aria-label="Close panel"
              className="grid h-11 w-11 flex-none place-items-center rounded-control text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </header>
          <div ref={scrollRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-3 py-4">
            {s.chat.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <span
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-body ${
                    m.role === "user" ? "rounded-br-sm bg-night text-on-night" : "rounded-bl-sm bg-surface-2 text-text"
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
            className="flex flex-none items-center gap-2 border-t border-line px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
          >
            <input
              ref={inputRef}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={s.chatTyping}
              placeholder={placeholder}
              aria-label="Ask NoBroke AI"
              className={`${field} rounded-control border border-line-2 px-3 transition-colors focus:border-text focus:ring-1 focus:ring-text`}
            />
            <button type="submit" disabled={!text.trim() || s.chatTyping} aria-label="Send" className={sendButton}>
              <SendIcon />
            </button>
          </form>
        </aside>
      )}

      {!hasThread && (
        <div className="pointer-events-none sticky bottom-0 z-40 w-full">
          <div className="pointer-events-auto mx-auto max-w-3xl px-3 pb-3 sm:px-6 sm:pb-4">
            {/* One surface. While the person is in it, the examples open
                above the field, inside the same border, so they never sit
                on top of the page's own text. */}
            <div
              className="copilot-bar overflow-hidden rounded-card border border-line-2 bg-surface focus-within:ring-1 focus-within:ring-text"
              onFocus={() => setFocused(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
              }}
            >
              {focused && (
                <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-line px-2 py-2" role="group" aria-label="Examples">
                  {copilotSuggestions(!!s.user).map((q) => (
                    <button
                      key={q}
                      type="button"
                      // Keeps the field focused (and the phone keyboard up) while the chip is tapped.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => send(q)}
                      className="inline-flex h-11 flex-none items-center whitespace-nowrap rounded-full border border-line-2 px-3.5 text-support text-text transition-colors hover:border-text focus-visible:-outline-offset-2"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(text);
                }}
                className="flex items-center gap-2 p-1.5"
              >
                <Mark />
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onFocus={() => {
                    if (s.chat.length) actions.openChat();
                  }}
                  disabled={s.chatTyping}
                  placeholder={placeholder}
                  aria-label="Ask NoBroke AI"
                  className={field}
                />
                <button type="submit" disabled={!text.trim() || s.chatTyping} aria-label="Send" className={sendButton}>
                  <SendIcon />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
