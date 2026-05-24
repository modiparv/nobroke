export type AssetClassId = "equity" | "debt" | "gold" | "hybrid";
export type RiskLevel = "Low" | "Moderate" | "High";

export interface AssetClass {
  id: AssetClassId;
  label: string;
  /** Band/badge color (from the design spec). */
  color: string;
  blurb: string;
}

export interface Fund {
  id: string;
  name: string;
  assetClass: AssetClassId;
  risk: RiskLevel;
  /** Trailing 5-year CAGR, percent (for the card meta). */
  fiveYr: number;
  /** Expense ratio, percent. */
  expense: number;
  /** Forward expected annual return, decimal — used for projections. */
  expReturn: number;
  /** Annualized volatility, decimal. */
  volatility: number;
}

/** fundId -> percentage weight (0..100). Should sum to 100. */
export type Allocation = Record<string, number>;

export type RiskProfile = "steady" | "balanced" | "bold";
export type CostSensitivity = "high" | "medium" | "none";

export interface Goal {
  id: string;
  name: string;
  emoji: string;
  targetToday: number;
  horizonYears: number;
  blurb: string;
  defaultProfile: RiskProfile;
  costSensitivity: CostSensitivity;
}

export interface PlanGoal {
  id: string;
  name: string;
  emoji: string;
  targetToday: number;
  horizonYears: number;
  allocation: Allocation;
  activeProfile: RiskProfile | null;
  /** Whether the user has confirmed the goal's target year/tenure. */
  tenureConfirmed: boolean;
}

export type CityTier = "metro" | "tier1" | "tier2" | "tier3";
export type Employment = "salaried" | "self_employed" | "freelancer" | "student";
export type CareerStage = "starting" | "growing" | "stable";

export interface Profile {
  cityTier: CityTier | null;
  employment: Employment | null;
  careerStage: CareerStage | null;
  rent: number;
  emi: number;
  takeHome: number;
  existingSavings: number;
}

export interface PlanInputs {
  targetToday: number;
  horizonYears: number;
  currentSavings: number;
  monthlySip: number;
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
  progress: number;
}

export type InsightTone = "positive" | "warning" | "info";
export interface Insight {
  tone: InsightTone;
  icon: string;
  title: string;
  message: string;
}

export type ChatRole = "ai" | "user";
export interface ChatMessage {
  role: ChatRole;
  text: string;
}

export interface AggregationProvider {
  id: string;
  name: string;
  providers: string;
  description: string;
  icon: string;
}
