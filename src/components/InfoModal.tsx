import { actions } from "../store";
import { btnPrimary } from "../ui";

export type InfoPanel = "about" | "pricing" | "contact";

const TIERS = [
  {
    name: "Free",
    price: "₹0",
    cadence: "forever",
    popular: false,
    features: ["Up to 3 goals", "Ready-made mixes", "NoBroke AI basics", "Plain-English plan"],
    cta: "You're on this",
  },
  {
    name: "Plus",
    price: "₹199",
    cadence: "/mo",
    popular: true,
    features: ["Unlimited goals", "Auto-import your accounts", "Priority NoBroke AI", "Smart rebalancing alerts"],
    cta: "Go Plus",
  },
  {
    name: "Pro",
    price: "₹499",
    cadence: "/mo",
    popular: false,
    features: ["Everything in Plus", "Human advisor check-ins", "Tax-saving help", "Early access to features"],
    cta: "Go Pro",
  },
];

function Tab({ id, active, onClick, children }: { id: InfoPanel; active: boolean; onClick: (p: InfoPanel) => void; children: string }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
        active ? "bg-ink text-white" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** Lightweight About / Pricing / Contact dialog opened from the header. */
export default function InfoModal({ panel, onPanel, onClose }: { panel: InfoPanel; onPanel: (p: InfoPanel) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="NoBroke info">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 max-h-[88vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-white/50 bg-white/85 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full border border-line bg-white/60 p-1">
            <Tab id="about" active={panel === "about"} onClick={onPanel}>About</Tab>
            <Tab id="pricing" active={panel === "pricing"} onClick={onPanel}>Pricing</Tab>
            <Tab id="contact" active={panel === "contact"} onClick={onPanel}>Contact</Tab>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink">
            ✕
          </button>
        </div>

        {panel === "about" && (
          <div className="space-y-3">
            <h2 className="text-2xl font-extrabold tracking-tight">Money, minus the jargon.</h2>
            <p className="text-sm leading-relaxed text-muted">
              NoBroke is a copilot for your money, built for people who were never taught this stuff. Tell it your goals and what
              you can save, and it shows whether you'll get there and where to invest, in plain words.
            </p>
            <p className="text-sm leading-relaxed text-muted">
              One simple portfolio funds all your goals. No spreadsheets, no judgement, no finance degree required.
            </p>
            <p className="text-[12px] text-muted">An early prototype. Projections are illustrative and not investment advice.</p>
          </div>
        )}

        {panel === "pricing" && (
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">Simple plans</h2>
            <p className="mt-1 text-sm text-muted">Start free. Upgrade when you want more.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {TIERS.map((t) => (
                <div
                  key={t.name}
                  className={`relative flex flex-col rounded-2xl border p-3.5 ${
                    t.popular ? "border-brand bg-brand/5" : "border-line bg-white/70"
                  }`}
                >
                  {t.popular && (
                    <span className="absolute -top-2 right-3 rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      Popular
                    </span>
                  )}
                  <div className="text-sm font-bold">{t.name}</div>
                  <div className="mt-1 flex items-baseline gap-0.5">
                    <span className="text-2xl font-extrabold tracking-tight">{t.price}</span>
                    <span className="text-[11px] text-muted">{t.cadence}</span>
                  </div>
                  <ul className="mt-3 flex flex-1 flex-col gap-1.5">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-[12px] text-ink">
                        <span className="text-positive">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={onClose}
                    className={`mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                      t.popular ? "bg-brand text-white hover:bg-brand-deep" : "border border-line text-ink hover:border-ink"
                    }`}
                  >
                    {t.cta}
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted">Prices are illustrative for this prototype.</p>
          </div>
        )}

        {panel === "contact" && (
          <div className="space-y-3">
            <h2 className="text-2xl font-extrabold tracking-tight">Say hi 👋</h2>
            <p className="text-sm leading-relaxed text-muted">Questions, feedback, or just want to talk money? We'd love to hear from you.</p>
            <div className="flex flex-col gap-2">
              <a href="mailto:hello@nobroke.app" className="flex items-center gap-2.5 rounded-xl border border-line bg-white/70 px-3 py-2.5 text-sm font-medium hover:border-brand">
                <span>✉️</span> hello@nobroke.app
              </a>
              <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white/70 px-3 py-2.5 text-sm font-medium">
                <span>📸</span> @nobroke.money
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white/70 px-3 py-2.5 text-sm font-medium">
                <span>🐦</span> @nobroke
              </div>
            </div>
            <button className={`${btnPrimary} mt-1 w-full`} onClick={() => actions.startOnboarding()}>
              Start your free plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
