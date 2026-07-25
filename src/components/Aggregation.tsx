import { useState } from "react";
import type { AggregationProvider } from "../lib/types";
import { sectionLabel } from "../ui";

const PROVIDERS: AggregationProvider[] = [
  { id: "cas", name: "Investment Portfolio", providers: "CAMS · KFintech", description: "Auto-import every stock, mutual fund & bond from your Consolidated Account Statement.", icon: "📊" },
  { id: "aa", name: "Banking & Income", providers: "Finvu · OneMoney · CAMSFinserv", description: "Consent-based access to income & spending via the RBI Account Aggregator network.", icon: "🏦" },
  { id: "baas", name: "Trading & Execution", providers: "DhanHQ · HDFC Sec · AngelOne", description: "Place trades, track holdings and pull real-time market data.", icon: "📈" },
  { id: "kyc", name: "Identity & KYC", providers: "NSDL · KRA", description: "Verify PAN and complete KYC in seconds. Fully paperless.", icon: "🪪" },
];

export default function Aggregation() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-caption font-medium uppercase tracking-[0.06em] text-muted">Coming soon</span>
        <p className="m-0 flex-1 text-sm text-muted">Already invested? Connect your accounts and NoBroke pulls everything in automatically, no spreadsheets.</p>
      </div>
      <span className={sectionLabel}>Connect your accounts</span>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PROVIDERS.map((p) => {
          const isOn = !!connected[p.id];
          return (
            <div key={p.id} className={`flex flex-col gap-2.5 rounded-2xl border bg-surface-2 p-4 ${isOn ? "border-brand" : "border-line"}`}>
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{p.icon}</span>
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-caption text-muted">{p.providers}</div>
                </div>
              </div>
              <p className="m-0 flex-1 text-xs text-muted">{p.description}</p>
              <div className="flex items-center justify-between">
                <span className={`text-caption font-medium ${isOn ? "text-pos" : "text-muted"}`}>{isOn ? "Synced · demo" : "Not connected"}</span>
                <button
                  disabled={isOn}
                  onClick={() => setConnected((c) => ({ ...c, [p.id]: true }))}
                  className="rounded-xl border border-line px-3 py-1.5 text-xs font-medium transition hover:border-brand disabled:opacity-50"
                >
                  {isOn ? "Connected ✓" : "Connect"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
