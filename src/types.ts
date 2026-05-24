export type RiskLevel = "Low" | "Medium" | "High" | "Very High";

/** Top-level asset class shown in the drag-and-drop balancer. */
export interface AssetCategory {
  id: string;
  name: string;
  /** Grayscale hex (monochrome palette). */
  shade: string;
  blurb: string;
}

/** A concrete product that lives inside an AssetCategory. */
export interface Product {
  id: string;
  name: string;
  shortName: string;
  categoryId: string;
  /** Expected annual return, decimal (0.12 = 12%). */
  expectedReturn: number;
  /** Annualized volatility (std dev), decimal. */
  volatility: number;
  risk: RiskLevel;
  /** True for growth (equity-like) exposure — used for risk-vs-horizon checks. */
  growth: boolean;
  description: string;
}

/** productId -> percentage weight (0..100). Need not sum to 100; normalized when used. */
export type Allocation = Record<string, number>;

export type RiskProfile = "conservative" | "balanced" | "aggressive";

/** How sensitive a goal's cost is to the user's city (e.g. a home costs more in a metro). */
export type CostSensitivity = "high" | "medium" | "none";

export interface Goal {
  id: string;
  name: string;
  emoji: string;
  /** Target amount in today's rupees (before city adjustment). */
  targetToday: number;
  horizonYears: number;
  blurb: string;
  defaultProfile: RiskProfile;
  costSensitivity: CostSensitivity;
}

/** A goal the user is actively planning (carries its own target, horizon and portfolio). */
export interface PlanGoal {
  id: string;
  name: string;
  emoji: string;
  targetToday: number;
  horizonYears: number;
  allocation: Allocation;
  activeProfile: string | null;
}

export type CityTier = "metro" | "tier1" | "tier2" | "tier3";
export type Employment = "salaried" | "self_employed" | "freelancer" | "student";
export type CareerStage = "starting" | "growing" | "stable";

/**
 * The user's financial profile. Backend taxonomy (never shown to users):
 *  - data 0: synthetic case-study / goal data
 *  - data 1: the user's real aggregated financials (income, expenses, holdings)
 *  - data 2: economic / ancillary data
 * Everything captured during onboarding feeds "data 1".
 */
export interface Profile {
  cityTier: CityTier | null;
  employment: Employment | null;
  careerStage: CareerStage | null;
  /** Monthly rent (₹). */
  rent: number;
  /** Total monthly EMIs (₹). */
  emi: number;
  /** Monthly take-home (₹). */
  takeHome: number;
  /** Existing savings + investments + EPF (₹). */
  existingSavings: number;
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
  year: number;
  invested: number;
  value: number;
}

export interface PlanResult {
  blendedReturn: number;
  blendedVolatility: number;
  xirr: number;
  projectedCorpus: number;
  requiredCorpus: number;
  totalInvested: number;
  gap: number;
  onTrack: boolean;
  requiredSip: number;
  series: ProjectionPoint[];
  months: number;
  realProjectedCorpus: number;
  goalReachedMonth: number | null;
  /** 0..1 share of plan completion (projected / required). */
  progress: number;
}

export type InsightTone = "positive" | "warning" | "critical" | "info";

export interface Insight {
  tone: InsightTone;
  icon: string;
  title: string;
  message: string;
}

export type ChatRole = "aura" | "user";
export interface ChatMessage {
  role: ChatRole;
  text: string;
}

/** A data-aggregation integration (CAS / AA / BaaS / KYC) from the API-integration plan. */
export interface AggregationProvider {
  id: string;
  name: string;
  providers: string;
  description: string;
  icon: string;
}
