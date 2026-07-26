/**
 * Every read out of the data layer returns this envelope. Confidence is the
 * caller's one-word answer to "can I show this number without a caveat":
 *   high      fresh data from an authoritative source
 *   modelled  derived or estimated (composition sleeves, category inference)
 *   stale     the source aged out; the value is the last known, labelled
 */
export type Confidence = "high" | "modelled" | "stale";

export interface Envelope<T> {
  ok: boolean;
  data: T | null;
  as_of: string | null;
  sources: string[];
  confidence: Confidence;
  warnings: string[];
}

export function envelope<T>(
  data: T,
  opts: { as_of: string; sources: string[]; confidence?: Confidence; warnings?: string[] },
): Envelope<T> {
  return {
    ok: true,
    data,
    as_of: opts.as_of,
    sources: opts.sources,
    confidence: opts.confidence ?? "high",
    warnings: opts.warnings ?? [],
  };
}

export function failure(warnings: string[]): Envelope<never> {
  return { ok: false, data: null, as_of: null, sources: [], confidence: "stale", warnings };
}
