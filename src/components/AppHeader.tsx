import { useEffect, useState } from "react";
import { actions, useStore } from "../store";
import AuthSheet from "./AuthSheet";
import Logo from "./Logo";

/**
 * App nav: logo, the Plan / Money toggle, account, and New plan.
 */
export default function AppHeader() {
  const s = useStore();
  const [showAuth, setShowAuth] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Tell the app an overlay is open so the copilot bar yields; both the auth
  // sheet and the account menu live inside this header's stacking context and
  // would otherwise sit under the copilot.
  useEffect(() => {
    actions.setModalOpen(showAuth || menuOpen);
    return () => actions.setModalOpen(false);
  }, [showAuth, menuOpen]);

  // Near-opaque bar: content must never ghost through it over the ink band.
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/95">
      <div className="mx-auto flex h-14 max-w-page items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />

        {/* Segmented control: a filled track, no border, exact heights. */}
        <nav className="flex items-center gap-0.5 rounded-full bg-surface p-0.5" aria-label="Sections">
          {(["plan", "money"] as const).map((t) => (
            <button
              key={t}
              onClick={() => actions.setTab(t)}
              aria-current={s.tab === t ? "page" : undefined}
              className={`inline-flex h-7 items-center rounded-full px-3 text-support capitalize transition sm:px-3.5 ${
                s.tab === t ? "bg-accent text-on-accent" : "text-text-2 hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={actions.startOnboarding}
            className="hidden h-8 items-center rounded-full border border-line px-3 text-support text-text transition hover:border-line-2 sm:inline-flex sm:px-3.5"
          >
            New plan
          </button>

          {s.user ? (
            <span className="relative inline-block">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Account menu"
                aria-expanded={menuOpen}
                className="grid h-8 w-8 place-items-center rounded-full bg-accent text-caption font-medium uppercase text-on-accent"
              >
                {s.user.email[0]}
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-60 rounded-card border border-line bg-surface p-1.5">
                    <p className="truncate px-3 py-2 text-caption text-text-3">{s.user.email}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void actions.signOut();
                      }}
                      className="w-full rounded-control px-3 py-2 text-left text-support hover:bg-surface-2"
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
                      className="w-full rounded-control px-3 py-2 text-left text-support text-neg hover:bg-neg-bg"
                    >
                      Delete account
                    </button>
                  </div>
                </>
              )}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              className="inline-flex h-8 items-center rounded-full bg-accent px-3 text-support font-medium text-on-accent transition hover:bg-accent-hi sm:px-3.5"
            >
              Sign in
            </button>
          )}
        </div>
      </div>

      {showAuth && <AuthSheet onClose={() => setShowAuth(false)} />}
    </header>
  );
}
