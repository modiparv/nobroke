import { useState } from "react";
import type { AggregationProvider } from "../lib/types";
import { sectionLabel } from "../ui";

const PROVIDERS: AggregationProvider[] = [
  { id: "cas", name: "Investment portfolio", providers: "CAMS · KFintech", description: "Auto-import every stock, mutual fund and bond from your Consolidated Account Statement.", icon: "" },
  { id: "aa", name: "Banking and income", providers: "Finvu · OneMoney · CAMSFinserv", description: "Consent-based access to income and spending via the RBI Account Aggregator network.", icon: "" },
  { id: "baas", name: "Trading and execution", providers: "DhanHQ · HDFC Sec · AngelOne", description: "Place trades, track holdings and pull market data.", icon: "" },
  { id: "kyc", name: "Identity and KYC", providers: "NSDL · KRA", description: "Verify PAN and complete KYC. Fully paperless.", icon: "" },
];

/**
 * Account connections, as hairline-separated rows in one container.
 *
 * This was a four-column card grid keyed to VIEWPORT width, so inside the
 * narrow side rail it rendered four ~100px columns of truncated text. Rows
 * scale with their container instead of the screen (spec section 8: rows over
 * cards for lists).
 */
export default function Aggregation() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className={sectionLabel}>Connect your accounts</span>
        <span className="flex-none rounded-full bg-surface-2 px-2 py-0.5 text-index uppercase tracking-wide text-text-2">
          Coming soon
        </span>
      </div>
      <p className="mt-1.5 text-support text-text-2">
        Auto-import your existing investments.
      </p>

      <ul className="mt-2 divide-y divide-line">
        {PROVIDERS.map((p) => {
          const isOn = !!connected[p.id];
          return (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-support font-medium text-text">{p.name}</div>
                <div className="truncate text-caption text-text-2">{p.providers}</div>
              </div>
              {isOn ? (
                <span className="flex-none rounded-full bg-pos-bg px-2.5 py-1 text-caption text-pos">Connected</span>
              ) : (
                <button
                  onClick={() => setConnected((c) => ({ ...c, [p.id]: true }))}
                  className="flex-none rounded-full border border-line px-3 py-1.5 text-caption font-medium text-text transition hover:border-line-2"
                >
                  Connect
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
