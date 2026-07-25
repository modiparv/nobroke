/**
 * The envelope every engine returns (spec §5).
 *
 * "Every response carries as_of, data_sources[], confidence and assumptions."
 * This is not decoration: the copilot may not compute anything, so it can only
 * explain a number if the number arrives with its provenance attached, and a
 * figure we cannot trace is a figure we cannot defend (spec §0, §7).
 */

import type { DateISO, TimestampISO } from "./types.ts";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type DataSourceKind =
  | "CAS_CAMS_KFINTECH" | "CAS_NSDL" | "CAS_CDSL" | "MF_CENTRAL"
  | "ACCOUNT_AGGREGATOR" | "EPFO" | "NPS_CRA" | "AMFI_NAV" | "EXCHANGE"
  | "MANUAL_ENTRY" | "DERIVED";

export interface DataSourceRef {
  kind: DataSourceKind;
  label: string;
  /** When this source's data was itself current. */
  asOf: DateISO;
}

export type WarningSeverity = "INFO" | "WARN" | "BLOCKING";

/**
 * A machine-readable problem. `BLOCKING` means the UI must not present the
 * number as trustworthy without a visible banner (spec §2.3): silent wrong
 * numbers are worse than no numbers.
 */
export interface EngineWarning {
  code: string;
  severity: WarningSeverity;
  message: string;
  /** Position/lot/account id the warning is about, when scoped. */
  subjectId?: string;
}

export interface EngineResult<T> {
  data: T;
  asOf: DateISO;
  computedAt: TimestampISO;
  dataSources: DataSourceRef[];
  confidence: Confidence;
  assumptions: Record<string, string | number | boolean>;
  warnings: EngineWarning[];
}

export function ok<T>(
  data: T,
  meta: {
    asOf: DateISO;
    dataSources?: DataSourceRef[];
    confidence?: Confidence;
    assumptions?: Record<string, string | number | boolean>;
    warnings?: EngineWarning[];
    computedAt?: TimestampISO;
  },
): EngineResult<T> {
  return {
    data,
    asOf: meta.asOf,
    computedAt: meta.computedAt ?? new Date().toISOString(),
    dataSources: meta.dataSources ?? [],
    confidence: meta.confidence ?? "HIGH",
    assumptions: meta.assumptions ?? {},
    warnings: meta.warnings ?? [],
  };
}

export function warn(code: string, message: string, subjectId?: string): EngineWarning {
  return { code, severity: "WARN", message, subjectId };
}

export function blocking(code: string, message: string, subjectId?: string): EngineWarning {
  return { code, severity: "BLOCKING", message, subjectId };
}

export function info(code: string, message: string, subjectId?: string): EngineWarning {
  return { code, severity: "INFO", message, subjectId };
}

/** True when any warning must stop the number being shown unqualified. */
export function hasBlocking(warnings: EngineWarning[]): boolean {
  return warnings.some((w) => w.severity === "BLOCKING");
}

/**
 * Confidence degrades to the weakest link. A portfolio containing a stale price
 * or a user-declared property value is not HIGH confidence, and saying so is
 * cheaper than being wrong.
 */
export function weakest(...levels: Confidence[]): Confidence {
  if (levels.includes("LOW")) return "LOW";
  if (levels.includes("MEDIUM")) return "MEDIUM";
  return "HIGH";
}
