export type StepKind = "intro" | "goals" | "single" | "money" | "outro";

export interface StepOption {
  value: string;
  label: string;
  hint?: string;
}

export interface Step {
  id: string;
  kind: StepKind;
  stage: number;
  stageLabel: string;
  title: string;
  subtitle?: string;
  cta?: string;
  field?: string;
  options?: StepOption[];
  /** Lowest acceptable answer for money steps (validation, not a slider bound). */
  min?: number;
}

/**
 * The intake. Every question is compulsory: a plan built on blanks is a guess,
 * so there is no skip. Order follows how an advisor works a first meeting:
 * income, then outgoings, then what is already held, then context, then goals.
 */
export const STEPS: Step[] = [
  {
    id: "intro",
    kind: "intro",
    stage: 0,
    stageLabel: "",
    title: "First, the full picture.",
    subtitle:
      "A real plan needs real numbers: what comes in, what goes out, and what you already hold. Five short sections. Every answer shapes the plan, so none of them can be skipped.",
    cta: "Begin",
  },

  // ---- Stage 1: Income ----
  {
    id: "employment",
    kind: "single",
    stage: 1,
    stageLabel: "Income",
    field: "employment",
    title: "How do you earn?",
    options: [
      { value: "salaried", label: "Salaried", hint: "A fixed pay cheque" },
      { value: "self_employed", label: "Business owner", hint: "You run your own venture" },
      { value: "freelancer", label: "Freelance or consulting", hint: "Project-based income" },
      { value: "student", label: "Student", hint: "Stipend or part-time income" },
    ],
  },
  {
    id: "takeHome",
    kind: "money",
    stage: 1,
    stageLabel: "Income",
    field: "takeHome",
    min: 1000,
    title: "Monthly take-home, after tax?",
    subtitle: "What actually lands in your account each month. Every recommendation is anchored to this number.",
  },

  // ---- Stage 2: Spending ----
  {
    id: "rent",
    kind: "money",
    stage: 2,
    stageLabel: "Spending",
    field: "rent",
    title: "Monthly rent or home loan EMI?",
    subtitle: "Enter 0 if you own outright or live with family.",
  },
  {
    id: "emi",
    kind: "money",
    stage: 2,
    stageLabel: "Spending",
    field: "emi",
    title: "Other EMIs each month?",
    subtitle: "Car, education, personal loans, pay-later. Enter 0 if none.",
  },
  {
    id: "monthlySpend",
    kind: "money",
    stage: 2,
    stageLabel: "Spending",
    field: "monthlySpend",
    title: "Everything else you spend monthly?",
    subtitle: "Groceries, bills, transport, eating out, subscriptions. A close estimate is fine.",
  },

  // ---- Stage 3: What you hold ----
  {
    id: "cashOnHand",
    kind: "money",
    stage: 3,
    stageLabel: "What you hold",
    field: "cashOnHand",
    title: "Cash in bank today?",
    subtitle: "Savings accounts and deposits you can reach, including your emergency fund.",
  },
  {
    id: "investedValue",
    kind: "money",
    stage: 3,
    stageLabel: "What you hold",
    field: "investedValue",
    title: "Current value of your investments?",
    subtitle: "Mutual funds, stocks, FDs, gold, EPF. Today's value, best estimate. Enter 0 if you are starting fresh.",
  },

  // ---- Stage 4: Context ----
  {
    id: "city",
    kind: "single",
    stage: 4,
    stageLabel: "Context",
    field: "cityTier",
    title: "Where are you based?",
    subtitle: "Cost of living changes what your goals cost.",
    options: [
      { value: "metro", label: "Metro", hint: "Mumbai, Delhi, Bengaluru" },
      { value: "tier1", label: "Tier 1 city", hint: "Pune, Jaipur, Kochi" },
      { value: "tier2", label: "Tier 2 city", hint: "Indore, Nagpur" },
      { value: "tier3", label: "Town or smaller city", hint: "Everywhere else" },
    ],
  },
  {
    id: "stage",
    kind: "single",
    stage: 4,
    stageLabel: "Context",
    field: "careerStage",
    title: "Where are you in your career?",
    options: [
      { value: "starting", label: "Early career", hint: "First few working years" },
      { value: "growing", label: "Growing", hint: "Income rising year on year" },
      { value: "stable", label: "Established", hint: "Income largely settled" },
    ],
  },
  {
    id: "dependents",
    kind: "single",
    stage: 4,
    stageLabel: "Context",
    field: "dependents",
    title: "Who counts on your income?",
    subtitle: "Responsibility changes how much risk a plan should carry.",
    options: [
      { value: "none", label: "Just me", hint: "No dependants" },
      { value: "partner", label: "A partner" },
      { value: "kids", label: "Partner and kids" },
      { value: "parents", label: "Parents or extended family" },
    ],
  },

  // ---- Stage 5: Goals ----
  {
    id: "goals",
    kind: "goals",
    stage: 5,
    stageLabel: "Goals",
    title: "What are you building toward?",
    subtitle: "Pick up to three. Each one gets a target, a date and a monthly amount.",
  },
  {
    id: "timeline",
    kind: "single",
    stage: 5,
    stageLabel: "Goals",
    field: "timeline",
    title: "When do you need the first one?",
    subtitle: "Roughly is fine. You can tune the year later.",
    options: [
      { value: "2", label: "Within 2 years" },
      { value: "4", label: "3 to 5 years" },
      { value: "8", label: "6 to 10 years" },
      { value: "14", label: "10 years or more" },
    ],
  },

  {
    id: "building",
    kind: "outro",
    stage: 0,
    stageLabel: "",
    title: "Your plan is ready.",
    subtitle:
      "Goals sized to your city and timeline, funded in priority order, with a monthly amount matched to what your income can actually spare.",
    cta: "See my plan",
  },
];

export const TOTAL_STAGES = 5;
