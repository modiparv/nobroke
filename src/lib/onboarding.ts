export type StepKind = "intro" | "goals" | "single" | "slider" | "outro";

export interface StepOption {
  value: string;
  label: string;
  emoji?: string;
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
  min?: number;
  max?: number;
  step?: number;
}

/** The "first date" questionnaire: dreams → lifestyle → spending → income → assets. */
export const STEPS: Step[] = [
  { id: "intro", kind: "intro", stage: 0, stageLabel: "", title: "Let's talk about your future — not your salary.", subtitle: "No forms. No judgement. Just a quick chat about what you actually want. Think of it as a first date for your money.", cta: "Let's go" },

  { id: "goals", kind: "goals", stage: 1, stageLabel: "The dream", title: "What are you dreaming about?", subtitle: "Pick up to 3. We'll build everything around these." },
  {
    id: "timeline", kind: "single", stage: 1, stageLabel: "The dream", field: "timeline",
    title: "When do you want your #1 goal?", subtitle: "Roughly is perfect. We'll fine-tune later.",
    options: [
      { value: "2", label: "Soon", emoji: "⚡", hint: "1–2 years" },
      { value: "4", label: "A few years", emoji: "🗓️", hint: "3–5 years" },
      { value: "8", label: "The long game", emoji: "🌳", hint: "6–10 years" },
      { value: "14", label: "Way ahead", emoji: "🔭", hint: "10+ years" },
    ],
  },

  {
    id: "city", kind: "single", stage: 2, stageLabel: "Your world", field: "cityTier",
    title: "Where's home base?", subtitle: "Cost of living changes the math.",
    options: [
      { value: "metro", label: "Metro", emoji: "🌆", hint: "Mumbai, Delhi, Bengaluru…" },
      { value: "tier1", label: "Tier 1 city", emoji: "🏙️", hint: "Pune, Jaipur, Kochi…" },
      { value: "tier2", label: "Tier 2 city", emoji: "🏘️", hint: "Indore, Nagpur…" },
      { value: "tier3", label: "Town / smaller city", emoji: "🏡", hint: "everywhere else" },
    ],
  },
  {
    id: "employment", kind: "single", stage: 2, stageLabel: "Your world", field: "employment",
    title: "How do you make your money?",
    options: [
      { value: "salaried", label: "Salaried", emoji: "💼" },
      { value: "self_employed", label: "Run my own thing", emoji: "🚀" },
      { value: "freelancer", label: "Freelance / gig", emoji: "🎨" },
      { value: "student", label: "Student", emoji: "📚" },
    ],
  },
  {
    id: "stage", kind: "single", stage: 2, stageLabel: "Your world", field: "careerStage",
    title: "Where are you in the journey?",
    options: [
      { value: "starting", label: "Just starting out", emoji: "🌱" },
      { value: "growing", label: "Growing fast", emoji: "📈" },
      { value: "stable", label: "Pretty stable", emoji: "🧘" },
    ],
  },

  { id: "rent", kind: "slider", stage: 3, stageLabel: "Lifestyle", field: "rent", title: "Roughly your monthly rent?", subtitle: "Spending's easier to talk about than earning. Slide to ₹0 if you own or live free.", min: 0, max: 120000, step: 1000 },
  { id: "emi", kind: "slider", stage: 3, stageLabel: "Lifestyle", field: "emi", title: "Any EMIs running right now?", subtitle: "Loans, that phone on EMI, anything. ₹0 is a great answer too.", min: 0, max: 150000, step: 1000 },

  { id: "takeHome", kind: "slider", stage: 4, stageLabel: "The real talk", field: "takeHome", title: "What's your monthly take-home?", subtitle: "This one number makes your plan accurate — it's how we calculate how fast you reach your goal. We pre-filled a guess; just drag to correct it.", min: 15000, max: 1000000, step: 1000 },

  { id: "savings", kind: "slider", stage: 5, stageLabel: "What you've got", field: "existingSavings", title: "Last one — what have you saved so far?", subtitle: "Savings, investments, EPF — a rough total is perfect.", min: 0, max: 20000000, step: 25000 },

  { id: "building", kind: "outro", stage: 0, stageLabel: "", title: "Finding your perfect money match…", subtitle: "We're turning your answers into a real plan.", cta: "See my plan" },
];

export const TOTAL_STAGES = 5;
