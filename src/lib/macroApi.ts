/** Client for the macro backdrop. One network call per session, shared by
 *  every consumer; any failure resolves to null and the app keeps its
 *  defaults. */

export interface MacroIndicator {
  key: string;
  label: string;
  unit: string;
  value: number;
  as_of: string;
  source: string;
}

export interface MacroData {
  indicators: MacroIndicator[];
  as_of: string;
  confidence: "high" | "modelled" | "stale";
}

let inflight: Promise<MacroData | null> | null = null;

export function fetchMacro(): Promise<MacroData | null> {
  inflight ??= fetch("/api/macro")
    .then(async (r) => {
      if (!r.ok) return null;
      const body = (await r.json()) as {
        ok: boolean;
        data?: { indicators?: MacroIndicator[] };
        as_of?: string;
        confidence?: MacroData["confidence"];
      };
      if (!body.ok || !body.data?.indicators?.length) return null;
      return { indicators: body.data.indicators, as_of: body.as_of ?? "", confidence: body.confidence ?? "stale" };
    })
    .catch(() => null);
  return inflight;
}
