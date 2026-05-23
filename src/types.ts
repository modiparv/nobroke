export type RiskLevel = "Low" | "Medium" | "High" | "Very High";

export interface AssetClass {
  id: string;
  name: string;
  shortName: string;
  /** Expected annual return, decimal (0.12 = 12%). */
  expectedReturn: number;
  /** Annualized volatility (std dev), decimal. */
  volatility: number;
  risk: RiskLevel;
  color: string;
  description: string;
}

/** assetId -> percentage weight (0..100). Need not sum to exactly 100; normalized when used. */
export type Allocation = Record<string, number>;

export type RiskProfile = "conservative" | "balanced" | "aggressive";

export type GoalCategory = "short" | "medium" | "long";

export interface Goal {
  id: string;
  name: string;
  emoji: string;
  /** Target amount in today's rupees. */
  targetToday: number;
  horizonYears: number;
  category: GoalCategory;
  blurb: string;
  defaultProfile: RiskProfile;
}

export interface PlanInputs {
  targetToday: number;
  horizonYears: number;
  currentSavings: number;
  monthlySip: number;
  /** Annual inflation, decimal. */
  inflation: number;
  allocation: Allocation;
}

export interface ProjectionPoint {
  month: number;
  /** Fractional years from start. */
  year: number;
  invested: number;
  value: number;
}

export interface PlanResult {
  /** Nominal blended annual return, decimal. */
  blendedReturn: number;
  blendedVolatility: number;
  /** Money-weighted effective annual return from the plan's cashflows, decimal. */
  xirr: number;
  projectedCorpus: number;
  /** Inflation-adjusted target (future cost of the goal). */
  requiredCorpus: number;
  totalInvested: number;
  /** projectedCorpus - requiredCorpus. Positive = surplus. */
  gap: number;
  onTrack: boolean;
  /** Monthly SIP needed to exactly hit requiredCorpus given current lump sum & return. */
  requiredSip: number;
  series: ProjectionPoint[];
  months: number;
  /** Projected corpus expressed in today's purchasing power. */
  realProjectedCorpus: number;
  /** First month projected value crosses requiredCorpus, or null if never within horizon. */
  goalReachedMonth: number | null;
}

export type InsightTone = "positive" | "warning" | "critical" | "info";

export interface Insight {
  tone: InsightTone;
  icon: string;
  title: string;
  message: string;
}
