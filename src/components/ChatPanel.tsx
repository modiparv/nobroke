import { useEffect, useRef, useState } from "react";
import { STARTERS } from "../lib/chat";
import { actions, useStore } from "../store";

function TypingDots() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm bg-brand-dark px-4 py-3">
      {[0, 0.2, 0.4].map((d, i) => (
        <span key={i} className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-white/70" style={{ animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}

export default function ChatDock() {
  const s = useStore();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [s.chat.length, s.chatTyping]);

  const send = (t: string) => {
    if (!t.trim() || s.chatTyping) return;
    actions.sendChat(t);
    setText("");
  };

  return (
    <>
      {!s.chatOpen && (
        <button
          onClick={actions.openChat}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-brand-deep px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-brand-dark"
        >
          <span aria-hidden>💬</span> Ask NoBroke AI
        </button>
      )}

      {s.chatOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/30" onClick={actions.closeChat} />
          <aside className="panel-slide absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-2xl sm:w-[400px]">
            <header className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-deep text-sm font-semibold text-white">N</span>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-[15px] font-semibold">
                  NoBroke AI <span className="live-dot inline-block h-2 w-2 rounded-full bg-brand" />
                </div>
                <div className="text-[11px] text-muted">online · finance assistant</div>
              </div>
              <button onClick={actions.closeChat} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink">
                ✕
              </button>
            </header>

            <div ref={scrollRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
              {s.chat.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <span
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                      m.role === "user" ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-brand-dark text-white"
                    }`}
                  >
                    {m.text}
                  </span>
                </div>
              ))}
              {s.chatTyping && <TypingDots />}

              {s.chat.length <= 1 && !s.chatTyping && (
                <div className="mt-1 flex flex-col gap-2">
                  {STARTERS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-xl border border-line px-3 py-2 text-left text-[13px] font-medium transition hover:border-brand"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-line p-3">
              <input
                value={text}
                disabled={s.chatTyping}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send(text);
                }}
                placeholder="Ask anything about money…"
                className="h-11 flex-1 rounded-xl border border-line px-3.5 text-sm outline-none focus:border-brand disabled:bg-paper"
              />
              <button
                onClick={() => send(text)}
                disabled={s.chatTyping || !text.trim()}
                aria-label="Send"
                className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-deep text-lg text-white transition hover:bg-brand-dark disabled:opacity-40"
              >
                ↑
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
