import { useEffect, useRef, useState } from "react";
import { actions, useStore } from "../store";
import AuthSheet from "./AuthSheet";
import Logo from "./Logo";

const TABS = [
  { id: "plan", label: "Plan" },
  { id: "portfolio", label: "Portfolio" },
  { id: "money", label: "Money" },
] as const;

/* Every control in the bar is 44px tall to tap and 36px tall to look at:
   the button is the tap area, the span inside it is what is drawn. The
   keyboard ring goes round the drawn shape. */
const ring =
  "group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-text";

/**
 * App nav: logo, the three tabs, and the account. The active tab is the one
 * ink fill in the bar. Sign in and New plan stay quiet, so the screen's one
 * blue button is always the one in the content below.
 */
export default function AppHeader() {
  const s = useStore();
  const [showAuth, setShowAuth] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Tell the app an overlay is open so the copilot bar yields; both the auth
  // sheet and the account menu live inside this header's stacking context and
  // would otherwise sit under the copilot.
  useEffect(() => {
    actions.setModalOpen(showAuth || menuOpen);
    return () => actions.setModalOpen(false);
  }, [showAuth, menuOpen]);

  // Escape closes the account menu and hands the keyboard back to its button.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // A solid bar: the page scrolling under it must never show through.
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg">
      {/* Three columns, so the tabs sit in the middle of the bar whenever the
          two sides leave room. On a phone the logo is the mark alone and the
          tabs take the tighter padding, down to a 320px screen. */}
      <div className="mx-auto grid h-14 max-w-page grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 max-[359px]:gap-1 max-[359px]:px-2 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center">
          <span className="sm:hidden">
            <Logo variant="mark" />
          </span>
          <span className="hidden sm:block">
            <Logo />
          </span>
        </div>

        <nav className="relative flex items-center" aria-label="Sections">
          <span aria-hidden className="absolute inset-x-0 inset-y-1 rounded-full bg-surface" />
          {TABS.map((t) => {
            const on = s.tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => actions.setTab(t.id)}
                aria-current={on ? "page" : undefined}
                className="group relative inline-flex h-11 items-center px-0.5 outline-none"
              >
                <span
                  className={`inline-flex h-8 items-center rounded-full px-2 text-support transition-colors min-[360px]:px-2.5 min-[390px]:px-3 sm:px-3.5 ${ring} ${
                    on ? "bg-accent-fill text-on-accent" : "text-text-2 group-hover:text-text"
                  }`}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-end sm:gap-1">
          <button
            type="button"
            onClick={actions.startOnboarding}
            className="hidden h-11 items-center whitespace-nowrap rounded-control px-3 text-support text-text-2 transition-colors hover:text-text sm:inline-flex"
          >
            New plan
          </button>

          {s.user ? (
            <span className="relative inline-flex">
              <button
                ref={menuButton}
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Account menu"
                aria-expanded={menuOpen}
                className="group -mr-1 grid h-11 w-11 place-items-center outline-none"
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full border bg-surface text-support font-medium text-text transition-colors ${ring} ${
                    menuOpen ? "border-text" : "border-line-2 group-hover:border-text"
                  }`}
                >
                  {s.user.email.charAt(0).toUpperCase()}
                </span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-20 w-64 max-w-[calc(100vw-1.5rem)] rounded-card border border-line bg-surface p-1.5">
                    <p className="truncate px-3 pb-1.5 pt-2 text-support text-text-2" title={s.user.email}>
                      {s.user.email}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void actions.signOut();
                      }}
                      className="flex min-h-11 w-full items-center rounded-control px-3 text-left text-body text-text transition-colors hover:bg-surface-2 focus-visible:-outline-offset-2"
                    >
                      Sign out
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        if (window.confirm("Delete your account and its stored plan? This cannot be undone.")) {
                          void actions.deleteAccount();
                        }
                      }}
                      className="flex min-h-11 w-full items-center rounded-control px-3 text-left text-body text-neg transition-colors hover:bg-neg-bg focus-visible:-outline-offset-2"
                    >
                      Delete account
                    </button>
                  </div>
                </>
              )}
            </span>
          ) : (
            <button type="button" onClick={() => setShowAuth(true)} className="group inline-flex h-11 items-center outline-none">
              <span
                className={`inline-flex h-9 items-center whitespace-nowrap rounded-full border border-line-2 px-3 text-support font-medium min-[360px]:px-3.5 text-text transition-colors group-hover:border-text ${ring}`}
              >
                Sign in
              </span>
            </button>
          )}
        </div>
      </div>

      {showAuth && <AuthSheet initialMode="login" onClose={() => setShowAuth(false)} />}
    </header>
  );
}
