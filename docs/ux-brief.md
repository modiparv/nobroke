# NoBroke: UX and product fixes (brief for Claude Code)

**Status (26 Sep 2026): Phases 1 and 1b shipped (#11, #12) and verified.** All 303 tests pass. Next: Phase 7 copy and links (7.2, 7.6), then Phase 2, then the rest of Phase 7.

Source: persona testing of `main` at `6238043` (25 Sep 2026), re-checked at `a0f550e` (26 Sep) with a 20-year-old student and a 40-year-old salaried parent, on 360px and 390px phone screens with the real fonts. Every issue below was reproduced in the app or in the code. File paths and line numbers are from that commit; line numbers are approximate.

## How to use this brief

1. Replace `docs/ux-brief.md` in the repo with this file.
2. In Claude Code, start with:
   > Read docs/ux-brief.md. Phases 1 and 1b are done. Do tasks 7.2 (copy) and 7.6 (links), one task per commit. Run `npm test` and `npm run build` after each task. Stop and report.
3. Review, then ask for the next phase. Phases 4 to 6 change structure, so review each step before continuing.

## Ground rules

- **Stack:** Vite, React, TypeScript, Tailwind.
  - State lives in `src/store.ts`. There's no router: tabs are `setTab("plan" | "portfolio" | "money")`.
  - Serverless API is in `api/`. Money maths is in `src/lib/finance.ts`, `src/lib/profile.ts` and `src/lib/options.ts`.
- **The deterministic engine is the only thing that changes a plan.** The AI (`api/chat.ts`) only proposes actions. Keep it that way.
- **Every behaviour change gets a test next to the code** (`src/lib/*.test.ts`). `npm test` and `npm run build` must pass after every task.
- **Saved plans must keep loading.** They live in localStorage (`nobroke_state_v1`) and on the server (`api/plan.js`). Any change to their shape needs a migration.
- **Use the repo's `.claude/skills/ui-ux-pro-max` skill for visual work.**
- **Check every UI change at 360px and 390px wide.** No horizontal scroll, nothing clipped.
- **Contrast:** text at least 4.5:1; chart lines, icons and borders that carry meaning at least 3:1 against their background.
- **Dependencies and commits:** no new dependencies unless a task says so. Match the existing commit style (plain sentences describing the change).
- **No "Soon" placeholders.** Hide what isn't built.

## Test personas

Use these for every acceptance check.

| | Aarav, 20 | Riya, 20 | Rajesh, 40 |
|---|---|---|---|
| How you earn | Student | Student | Salaried |
| Comes in each month | ₹8,000 | ₹15,000 | ₹1,60,000 |
| Rent / EMIs | 0 / 0 | 0 / 0 | 0 / ₹38,000 |
| Monthly spend | ₹3,500 | ₹0 (confirm) | ₹65,000 |
| Cash / invested | ₹22,000 / ₹6,000 | ₹10,000 / 0 | ₹3,00,000 / ₹18,00,000 |
| City / career | Tier 1 / Still studying | Tier 1 / Still studying | Tier 1 / Established |
| Dependants | Just me | Just me | Partner and kids (plus parents after task 3.1) |
| Goals | New phone or laptop, Big trip, Study abroad or upskill | Emergency fund, New phone or laptop, Big trip | Child's education, Retire early, Parents' care |
| First goal | Within 2 years | Within 2 years | 6 to 10 years |

What these personas show at `a0f550e`:
- **Aarav:**
  - on the default goal prices (trip ₹2 L, laptop ₹1 L), opens on "0 of 3 goals on track", all "Far short";
  - with his real prices (trip ₹20,000, laptop ₹70,000), entered at the new cost step, he gets "2 of 3". Correct; keep it.
- **Riya:** monthly ₹10,000, emergency fund ₹25,000. Both correct; keep them that way.
- **Rajesh:**
  - "Cash runway 2.9 mo", "1 of 3 on track";
  - Child's education reads "Far short" with no date move;
  - "Needs ₹53,969/mo" matches the reason card.
  - All correct; keep them that way.

---

## Phase 1: correct numbers and honest words (done in #11, verified 26 Sep)

### 1.1 Don't offer "Move to {year}" for goals whose date can't move
- **Problem:** Rajesh's Child's education (₹65 L by 2034) offers "Move to 2046". His daughter would be 30.
- **Where:**
  - `src/components/Metrics.tsx`, around lines 110 to 135 (renders Invest more / Move to / Lower target);
  - `src/lib/options.ts` (`goalOptions`, `reachableHorizon`);
  - `src/lib/goals.ts` (catalogue).
- **Change:**
  - Add `dateFixed: boolean` to each catalogue goal: `child` and `wedding` are `true`, the rest `false`.
  - Never show the date move for date-fixed goals.
  - For any goal, hide the date move when it lands more than 5 years after the goal's own date.
- **Accept:** Rajesh's Child's education shows no "Move to". Aarav's laptop still shows a date move when it's within 5 years. Tests in `src/lib/options.test.ts`.

### 1.2 Match the "short" wording to the size of the gap
- **Problem:** "A little short" appears for a ₹54.69 L gap, which is more than half the goal.
- **Where:**
  - `src/components/Insights.tsx` line 20;
  - status labels in `src/components/GoalsChart.tsx` line 140 and `src/components/MoneyTab.tsx` line 188;
  - goal tiles in `src/components/Plan.tsx`.
- **Change:**
  - Add one helper, `gapLevel(result)`, in `src/lib/`. It returns:
    - `on_track`;
    - `little_short` (gap under 15% of the required corpus);
    - `short` (15% to 50%);
    - `far_short` (over 50%).
  - Use it for reason-card titles, pills and tile labels everywhere.
  - `far_short` uses the `--neg` colour.
- **Accept:** Rajesh's Child's education reads "Far short". Unit tests cover each threshold.

### 1.3 One rounding rule for "monthly needed"
- **Problem:** the same screen shows "Needs ₹53,969/mo" (Metrics) and "₹53,968/mo" (reason card).
- **Where:** `src/lib/options.ts` (`monthly: Math.ceil(r.requiredSip)`) and `src/components/Insights.tsx` lines 19 to 20 (`formatINR(r.requiredSip)`).
- **Change:** one helper that rounds up to the rupee, used by both.
- **Accept:** both places show the same number for Rajesh. Test added.

### 1.4 Rename "Cover" to "Cash runway"
- **Problem:** a 40-year-old reads "Cover" as insurance. It actually means months of spending that cash covers.
- **Where:** `src/components/Plan.tsx` line 196, plus any other label for months of cash.
- **Accept:** the band shows "Cash runway 2.9 mo" for Rajesh.

### 1.5 Copilot: bikes, gifts, and amount plus time together
- **Where:** `src/lib/command.ts` line 33 (`bike|scooter` currently maps to First car) and line 36 (`mom|dad|maa|papa` currently maps to Parents' care); tests in `src/lib/command.eval.test.ts`.
- **Change:**
  - "bike" or "scooter" maps to the new `bike` goal from task 1.6.
  - "gift for mom 5k" must not set Parents' care. Let it fall through to the AI.
  - "trip 25k in 10 months" currently applies only the timeline and drops the ₹25,000. Apply both the target and the timeline, or hand the sentence to the AI, which already supports several actions per message.
- **Accept:** these cases in `command.eval.test.ts`:
  - `i want a bike for 90k` sets the bike goal to ₹90,000;
  - `gift for mom 5k` does not set parents;
  - `trip 25k in 10 months` sets target ₹25,000 and 1 year.
  - Existing cases (`iphone 16 for 80k`, `macbook air m3 for 1.1 lakh`, `goa trip with 4 friends for 20k`) keep passing.

### 1.6 Student-sized goals in the catalogue
- **Where:** `src/lib/goals.ts` lines 11 to 23. Also update:
  - the goal id list the AI tools accept in `api/chat.ts` (the enum and the description string, around line 32);
  - the keywords in `src/lib/command.ts`;
  - `evals/golden.jsonl`.
- **Change:**
  - Add `bike`: "Bike or scooter", ₹1 L, 1 year.
  - Add `college`: "College fees", ₹1.5 L, 1 year.
  - Add `course`: "Upskill or a course", ₹50,000, 1 year.
  - Rename `education` to "Study abroad". Keep the id `education` so saved plans keep working, and migrate the stored goal name.
- **Accept:** the intake goal grid shows the new tiles, the AI tool enum includes the new ids, and tests and evals are updated.

---

## Phase 1b: follow-ups found while verifying Phase 1 (done in #12, verified 26 Sep)

### 1b.1 Split money by what each goal still needs
- **Problem:**
  - After Aarav sets his trip to ₹20,000 and his laptop to ₹70,000, the trip keeps all the money: "₹28,000 saved, reaches ₹67,866" for a ₹20,000 goal. The laptop gets ₹0 and reads "Far short".
  - Tapping "Use recommended split" still over-funds the trip (reaches ₹39,077) and leaves the laptop "Short".
- **Cause:** `recommendShares` in `src/store.ts` (around lines 363 to 395) computes each goal's monthly need with `requiredSip(reqCorpus, 0, …)`. It ignores the money already saved for that goal, so a goal that savings already cover still gets its full monthly share.
- **Change:**
  - Put saved money into the nearest goals first, only up to what each needs.
  - Then compute each goal's monthly need net of the saved money it holds.
  - Re-run the split automatically when a goal's amount or date changes, unless the person has customised it (`goalSharesCustom`).
- **Accept:**
  - With Aarav's plan, trip ₹20,000 and laptop ₹70,000:
    - the trip is covered from savings with ₹0 a month;
    - the laptop reads "On track";
    - the band reads "2 of 3 goals on track".
  - Check the maths with the engine: covering the trip takes about ₹19,200 of savings. The remaining ₹8,800 plus ₹2,900 a month projects to ₹88,465 against ₹78,652 needed.
  - Tests in `src/lib/` for the split.

### 1b.2 Ask what each goal costs when it's picked
- **Problem:** default prices (trip ₹2 L, laptop ₹1 L) put every goal of a student at "Far short" on the first screen.
- **Change:**
  - Right after the goal grid in the intake, show one money field per picked goal, prefilled with the default and skippable.
  - Use the entered amounts as the goals' targets.
- **Accept:** Aarav can enter ₹20,000 and ₹70,000 during the intake. With 1b.1 done, his plan opens on "2 of 3 goals on track".

### 1b.3 College fees have a fixed date
- **Where:** `src/lib/goals.ts`, the `college` entry.
- **Change:** set `dateFixed: true`, because fees fall due on a date.
- **Accept:** College fees never shows "Move to {year}". Test in `options.test.ts`.

### 1b.4 A calmer "Far short"
- **Where:** `src/components/Insights.tsx` line 26 uses 🚨 for `far_short`.
- **Change:** replace the siren with a plain alert icon. The full status icon set comes in task 2.3.
- **Accept:** no siren emoji anywhere in the app.

### 1b.5 One line of context for education goals that are far short
- **Change:** under the moves for Child's education and College fees, add one line: "An education loan or scholarship can cover part of this." This is general information, not a product recommendation.
- **Accept:** shown only for those goals when they're far short.

---

## Phase 2: readability and colour

### 2.1 Bigger text that respects the phone's text-size setting
- **Problem:** 91 to 100% of the text on the Plan, Portfolio and Money tabs is below 14px. Body copy is 13.5px; section labels are 10px, all caps, widely spaced. Sizes are in px, so the user's own text-size setting can't enlarge them.
- **Where:** `tailwind.config.js`, `fontSize`.
- **Change:**
  - Move every size to rem.
  - `body` and `row`: 1rem (16px).
  - `support`: 0.875rem (14px).
  - `caption`: 0.8125rem (13px).
  - `eyebrow` and `index`: 0.75rem (12px).
  - Eyebrows go to sentence case: drop `uppercase` and the 0.13em letter-spacing.
- **Accept:**
  - Under 10% of the visible text on each app tab is below 14px.
  - No overflow at 360px.
  - Before and after screenshots for all three tabs.

### 2.2 One colour for main buttons
- **Problem:** main buttons are blue on the landing page and black (ink) inside the app.
- **Where:** `--accent-fill` and `--accent-fill-hi` in `src/index.css`, and the 12 `bg-accent-fill` usages.
- **Change:**
  - Primary actions (Start your plan, Continue, Create account, Save) use blue `#2E5BFF`, hover `#1A44D9`, with white text (5.2:1).
  - Selected states (active tab, chosen tiles) may stay ink.
- **Accept:** every primary button is blue, and no screen has more than one primary button.

### 2.3 Status is always colour + icon + word
- **Where:** goal tiles and pills in `src/components/Plan.tsx`, `src/components/GoalsChart.tsx` and `src/components/MoneyTab.tsx`; reason cards in `src/components/Insights.tsx`.
- **Change:**
  - On track: green `--pos` + tick.
  - Short: amber `--cau` + clock (use `#C77700` for dots and lines, 3.5:1 on white; keep `#8A5707` text on `#FAF0E0`, 5.4:1).
  - Far short: red `--neg` + alert (`#B3261E` on `#F9E8E7`, 5.5:1).
- **Accept:** a greyscale screenshot still shows each state clearly.

### 2.4 Colour-blind-safe chart lines, labelled at the line ends
- **Problem:** with red-green colour blindness simulated, the green and amber goal lines on the Plan band turn into two similar tans.
- **Where:** `--chart-1..6` and `--chartn-1..6` in `src/index.css` (today `#2e5bff`, `#0e7a5a`, `#9e6408` and `#5c82ff`, `#34c88e`, `#e0a23c`), and `src/components/GoalsChart.tsx`.
- **Change:**
  - On light backgrounds use `#0072B2`, `#D55E00`, `#B35C8A` (3.6:1 or better on the beige).
  - On the dark band use `#56B4E9`, `#E69F00`, `#CC79A7` (5.9:1 or better).
  - Write the goal name at the end of each line.
- **Accept:** after running the Plan screenshot through a deuteranopia filter (the Machado 2009 matrix), all three lines are still distinguishable.

### 2.5 Charts in today's rupees, with every goal visible
- **Problem:**
  - Aarav's chart axis tops out at ₹73.76 L and Rajesh's at ₹10.2 Cr, so the smaller goals sit flat on the baseline.
  - The goal-path x-axis uses ticks like "1y 7m" and "3y 2m".
- **Where:** `src/components/GoalsChart.tsx`, `src/components/Chart.tsx`.
- **Change:**
  - Default the band to today's money.
  - Show each goal as its own progress ring or bar (or give each line its own scale). Keep the future-money view behind a toggle.
  - Use calendar years on the x-axis.
- **Accept:** every goal's progress is visible on the first screen for all three personas.

### 2.6 Dark mode
- **Where:** `src/lib/theme.ts` (currently "One theme: light"), the tokens in `src/index.css`, and the boot script in `index.html`.
- **Change:**
  - Add a dark token set that follows the system setting, with a toggle (in Me once Phase 4 lands).
  - Recheck every text and background pair.
- **Accept:** all screens are usable in dark mode and the contrast rules hold.

### 2.7 A moment of celebration
- **Change:**
  - Add a marigold accent `#F2A20C`, used only when a goal turns on track.
  - Add a short animation that respects `prefers-reduced-motion`.
- **Accept:** raising Aarav's monthly until the laptop goal is on track triggers the moment once.

---

## Phase 3: what a 40-year-old needs

### 3.1 Several dependants
- **Problem:** "Who counts on your income?" is single-choice, so Rajesh can pick kids or parents, not both.
- **Where:**
  - `src/lib/onboarding.ts` around lines 154 to 166;
  - `src/lib/types.ts` and `src/lib/profile.ts` (`dependents`);
  - `src/lib/risk.ts` lines 46 to 48;
  - the demo profile in `src/store.ts` around line 607.
- **Change:**
  - Make the question multi-select: partner, kids, parents. "Just me" is exclusive. Reuse the goal grid's multi-select pattern.
  - In `risk.ts`, each group of dependants lowers the score; keep the bonus for "Just me".
  - Migrate saved single values to arrays.
- **Accept:** Rajesh can select partner, kids and parents. Risk tests are updated, and a plan saved before the change still loads.

### 3.2 Loans and property in net worth
- **Problem:** Net worth shows ₹21 L for Rajesh with no question about his home loan balance or his home.
- **Where:**
  - The engine already models this: `src/wealth/engines/networth.ts` (liabilities, household members, property). Wire it rather than rebuilding it.
  - The UI is in `src/components/MoneyTab.tsx`; the intake is in `src/lib/onboarding.ts`.
- **Change:**
  - When EMIs are above 0, ask for the outstanding balance and the loan type. Optionally ask for the home's value.
  - Net worth = assets minus liabilities, with loans shown as their own line.
- **Accept:** Rajesh's net worth reflects the loan he enters. `networth.test.ts` still passes, and a new test covers the wiring.

### 3.3 Holdings by type
- **Problem:** the intake stores one line, "Existing investments ₹18 L", with the type label "Portfolio". The Breakdown then calls it "Funds", even when the money is in EPF or FDs.
- **Where:** `src/components/Holdings.tsx`, `src/components/MoneyTab.tsx`, and the `investedValue` intake step.
- **Change:**
  - Let people split the amount: EPF/PPF, FDs, mutual funds, stocks, gold, other.
  - Or label the unsplit amount "Not sorted yet" with a prompt to split it.
  - Rename the "Portfolio" type label so it doesn't clash with the Portfolio tab.
- **Accept:** the Breakdown never labels EPF or FD money as "Funds".

### 3.4 Insurance basics
- **Change:**
  - Ask about term cover (yes/no, amount) and health cover (yes/no, amount, whether it covers parents).
  - When someone with dependants has no term cover, show one advisor note. Keep it to education, with no product recommendations.
- **Accept:** Rajesh with no term cover sees one note. Aarav (no dependants) doesn't.

---

## Phase 4: navigation and page structure

**Today:**
- Three tabs sit at the top: Plan (3.8 phone screens long), Portfolio (3.1) and Money (1.9). The copilot bar sits at the bottom.
- "Portfolio" and "Money" sound the same.
- Risk appetite and a portfolio summary appear on both Plan and Portfolio.
- The landing page promises Protect, Plan, Prosper, but the app has no Protect section.

**Target:** five bottom tabs (Home, Goals, Invest, Protect, Me), with the copilot reachable from every tab. Do it in the steps below and ship each step.

### 4.1 Bottom tab bar
- Move the tabs from `src/components/AppHeader.tsx` into a new bottom tab bar. Start with today's three tabs.
- Respect safe-area insets and use 48px touch targets.
- The copilot button sits above the bar. The header keeps the logo and Sign in.
- **Accept:** works at 360px and 390px, and the copilot and tabs don't overlap.

### 4.2 Split Plan into Home and Goals
- **Home:**
  - every goal as a ring with a one-word verdict;
  - "one thing to do this week" (from `AdvisorNote.tsx`);
  - a net worth card.
  - At most 1.5 phone screens.
- **Goals:** the goal list. Tapping a goal opens its own screen, containing today's inline goal editor (the workbench part of `Plan.tsx`, plus `Metrics.tsx` and `Insights.tsx`).
- **Accept:** Home fits in 1.5 screens for all personas, and a goal's detail screen replaces the inline editor.

### 4.3 Remove duplicates
- `PortfolioGlimpse` (`src/components/Plan.tsx` line 289) and the second risk appetite leave Home. They live only in Invest.
- **Accept:** no section appears on two tabs.

### 4.4 Invest (was Portfolio)
- Put the ready-made mix first.
- Move Bucket studio and the fund pool behind "Build your own (advanced)".
- Add "Start or pause a SIP" only if execution exists; otherwise omit it.

### 4.5 Me
- Me holds:
  - "Your numbers" (`src/components/MoneyTab.tsx` line 229);
  - family (from task 3.1);
  - text size, dark mode, language;
  - sign in and out.
- Hide "Wealth tools" (`MoneyTab.tsx` line 258, all five marked Soon) until they're built.

### 4.6 Protect
- Protect holds the emergency fund, loans (task 3.2) and insurance (task 3.4).
- Keep the tab hidden until 3.2 and 3.4 exist.

**Accept for Phase 4:**
- Every tab except the Goals list is at most 2 phone screens long.
- All `setTab(...)` calls (in `PortfolioGlimpse.tsx`, `Metrics.tsx` and `MoneyTab.tsx`) point to the new tabs.
- The app opens on the screen the person last used.

---

## Phase 5: landing page text diet

**Where:** `src/components/Landing.tsx`.

**Today:** 438 words, about 6 phone screens tall. Research shows people read 20 to 28% of the words on a page.

**Change:**
- Cut to 150 words or fewer, at most 2.5 screens on a 390px phone.
- Hero example gets a toggle: "Student · ₹3,000 a month" and "Family · ₹37,000 a month". The current ₹25,000-a-month figures are set up around line 169.
- Put trust above pricing: who's behind NoBroke, what it is and isn't registered as, and how data is kept safe.
- Pricing (`TIERS`, around lines 41 to 71) gets the free tier, using copy from the founders.
- Keep the footer disclaimer.

**Accept:** the word-count and height targets are met, and the page passes an automated accessibility check (axe or Lighthouse, if available).

---

## Phase 6: bigger items (ask before starting)

- **Deadlines in months:**
  - the engine works in whole years (`horizonYears`);
  - the copilot currently rounds "8 months" to 1 year with a note;
  - the AI's timeline tool accepts only whole years from 1 to 60.
- **Custom goals** with their own name, emoji, amount and date, across the UI, `command.ts` and the AI tools in `api/chat.ts`.
- **Step-up SIPs** (raise the monthly amount X% a year) in `src/lib/finance.ts`. This becomes the main move for date-fixed goals from task 1.1.
- **The remaining "Soon" items:** 4 account connectors in the intake and 5 wealth tools. Build them or hide them.

---

## Phase 7: Plan, Portfolio and Money (advisory-first rebuild)

Each page answers one question:

| Page | The question it answers |
|---|---|
| Plan | Am I on track, and what do I do next? |
| Portfolio | Where is my money invested, and why? |
| Money | What do I own, owe, earn and spend? |

Rules for all three pages:
- **"Do this next":** the top of Plan shows one action at a time.
- **Every recommendation shows four things:** what to do, why, what it changes (goal dates and amounts), and what would change the advice.
- **Links open the exact thing** (a sheet or a highlighted section), never just the top of another tab.

### 7.1 Voice
- Write like a friend who is good with money. Short sentences. Numbers first. One idea per line.
- No metaphors, no semicolons, no sentences strung together with "·", no all-caps labels. Say what happens next ("Your laptop moves to March 2028").
- Replace these words:
  - "pace" → growth
  - "trajectory" → where your goals are headed
  - "appetite" → risk level
  - "instruments" → funds
  - "pool" → all options
  - "heatmap" → where your money is
- Remove these words: guardrails, rhymes, journey, unlock, seamless, empower.
- Keep the legal disclaimer once per page, in the wording counsel approves.

### 7.2 Copy deck (current → new)
Paths are relative to `src/`. Where a string is built from parts, change the template.

**Plan**

| Where | Now | New |
|---|---|---|
| Plan band | Total saved | Saved so far |
| Plan band | Cash | In the bank |
| Plan band | Monthly | Added every month |
| Plan band | Cash runway / 2.9 mo | Cash lasts / 2.9 months |
| components/GoalsChart.tsx:87 | Goal trajectories · At today's pace | Where your goals are headed · If you keep going like this |
| components/Plan.tsx ~244 | Goals · priority order · drag to reorder | Your goals, most urgent first |
| components/Plan.tsx:252 | Use recommended split | Split my money for me |
| Goal tile | reaches ₹15.39 L | will reach ₹15.39 L |
| components/AdvisorNote.tsx:31 | Your cash covers about 2 months of spending. We keep 3 to 6 months within reach before taking any risk. / Review cash | Your cash covers only 2 months of expenses. Keep 3 to 6 months in the bank before you invest more. / Add to cash |
| components/GoalCard.tsx:159 | Set up this goal / Target year / Target amount / Monthly amount | Goal details / By when / How much (today's prices) / Every month |
| components/Metrics.tsx | ₹11.82 L of ₹1.04 Cr needed by 2034 | ₹11.82 L saved of ₹1.04 Cr needed by 2034 |
| components/Metrics.tsx:89 | At today's pace, ₹82.48 L by 2034 · ₹21.12 L short | At this rate: ₹82.48 L by 2034. ₹21.12 L short. |
| components/Metrics.tsx:111 | Needs ₹51,086/mo; ₹37,000 is free after your other goals. Invest more → | To get there, put in ₹51,086 a month. You have ₹37,000 free after your other goals. / Put in more |
| components/Metrics.tsx | Lower target to ₹51.5 L | Aim for ₹51.5 L instead |
| components/Metrics.tsx | 8 yrs left · ₹37,000/mo · 10.4%/yr pace · technical | 8 years to go · ₹37,000 a month · assumes 10.4% growth a year · Show the maths |
| Goal chart title | Path to child's education | How child's education grows |
| components/GoalCard.tsx:229 | Why this plan / More reasons | Why we say this / More |
| components/Insights.tsx (gap card) | At today's pace you reach ₹82.48 L, about ₹21.12 L under. Raising your monthly investing to ₹51,086/mo (+₹14,086) closes the gap. | You'll reach ₹82.48 L. That's ₹21.12 L short. Add ₹14,086 a month (₹51,086 in total) and you'll make it. |
| components/Insights.tsx:49 | Start a year later and the monthly needed rises to ₹X, from ₹Y now. Time is doing part of the work. | Wait a year and you'll need ₹X a month instead of ₹Y. Starting now is cheaper. |
| components/Insights.tsx:52 | Your ₹1 L goal will cost about ₹1.12 L in 2 yrs, so we plan for the future price, not today's. | Prices go up. ₹1 L today is about ₹1.12 L in 2 years, so we plan for ₹1.12 L. |
| components/Insights.tsx:31 | A bit bold for a near goal: 53% in stocks with only 2 yrs left can swing a lot. Lean toward bonds (calmer) for this one. | Too risky for a goal this close: 53% of this money is in stocks and you need it in 2 years. One bad year could cut it. Move it to safer funds. |
| components/GoalCard.tsx:250 | Anything worth remembering: who is chipping in, what is already booked, what could change the number. | Notes, e.g. "Papa is paying half. Flights are booked." |
| Goal card | Remove this goal | Delete this goal |
| components/PortfolioGlimpse.tsx | Expected pace / Largest holding / Portfolio heatmap / Sized by value | Moves to Portfolio (see 7.4). Use "Expected growth" and "Where your money is". Drop "Largest holding" and "Sized by value". |

**Portfolio**

| Where | Now | New |
|---|---|---|
| components/PortfolioTab.tsx:23 | Every goal grows in this one portfolio. Build it here; watch it work on the plan. | All your goals are funded from this one mix of funds. Change it here and your goals update. |
| components/RiskMeter.tsx:37 | Risk appetite | Your risk level |
| Your portfolio card | ₹37,000/mo · Stocks 53% · Bonds 27% · Gold 20% | Your ₹37,000 a month goes: 53% stocks, 27% bonds, 20% gold |
| components/PortfolioBuilder.tsx:385 | A year, historically 7%–12% … On ₹1 lakh, if the future rhymes with the past. | In the past this mix grew 7 to 12% a year. ₹1 lakh became ₹1.23–1.40 L in 3 years and ₹2.02–3.09 L in 10. The future can be different. |
| Ready-made heading | Ready-made portfolios | Pick a mix |
| lib/portfolios.ts:11/16/21 | Protect first / Grow with guardrails / Maximize growth | Fewer ups and downs / Some ups and downs / Big ups and downs |
| components/PortfolioBuilder.tsx:414 | Beyond appetite | Riskier than you said you're OK with |
| Funds list heading | What's in your portfolio · 5 funds | The 5 funds in your mix |
| components/PortfolioBuilder.tsx:230 | Pick your own (optional) / Type 3 or more letters to search every AMFI-listed scheme. | Want a specific fund? / Search any mutual fund (type 3 letters) |
| components/BucketBuilder.tsx:60–66 | Bucket studio / A draft, until you apply it / Build a portfolio your way. Drag instruments in from the pool, set their weights, and when it looks right, make it your portfolio. | Build your own mix (advanced) / Nothing changes until you tap Apply / Add funds, set how much goes to each, then apply. |
| Bucket target chips | Building toward: The whole plan | For: all goals |
| Empty bucket | Drag your first instrument here or tap anything in the pool below. | Your mix is empty. Tap a fund below to add it. |
| components/BucketBuilder.tsx:225 | Suggested for your appetite | Good fits for your risk level |
| components/BucketBuilder.tsx:252 | The pool · Drag in, or tap to add · Fund picks / ETFs / Gold & silver / Bonds & debt / Real estate & cash | All options · tap to add · Funds / ETFs (need a demat account) / Gold and silver / Bonds / Property and cash |
| components/BucketBuilder.tsx:308 | Want a specific fund? The search on the left covers every AMFI-listed scheme, A to Z. | Can't find your fund? Use the search. (Today's text says "on the left", which is wrong on phones, where the search sits above.) |

**Money**

| Where | Now | New |
|---|---|---|
| components/MoneyTab.tsx:88 | What you have, and where it sits. Every number here feeds the plan. | Everything you own and owe. Change a number here and your plan updates. |
| components/MoneyTab.tsx:106 | Cash ₹3 L · Invested ₹18 L · ₹37,000/mo going in | ₹3 L in the bank · ₹18 L invested · ₹37,000 added every month |
| components/MoneyTab.tsx:112 | About ₹1.37 Cr in 10 years at this pace. | Keep this up and it could be ₹1.37 Cr in 10 years. |
| Breakdown toggle | Breakdown · By location / By goal | Where it is · By type / By goal |
| components/Holdings.tsx:36 | Existing investments (type label "Portfolio") | Your investments (unsplit amount labelled "Not sorted yet. Tap to split.") |
| Your numbers | Your numbers · Monthly income / Monthly spend / Monthly investing | Every month · Money in / Spent / Invested |
| components/MoneyTab.tsx:242 | ₹57,000 left after spending. You put ₹37,000 of it to work. | ₹57,000 is left after expenses. ₹37,000 goes into investments. ₹20,000 has no plan yet. (Compute the remainder. Hide the last sentence when it's 0.) |
| components/MoneyTab.tsx:258 | Wealth tools: Tax centre, Portfolio x-ray, Cost check, Nominee audit, Action inbox (all "Soon") | Remove until built |

**Accept for 7.2:**
- No banned word or semicolon appears anywhere on the three pages.
- Every row above shows the new text.
- Tests that match copy are updated.

### 7.3 Plan page (top to bottom)
1. **Do this next** (new). One card: the single highest-value action from the advisor notes and goal fixes.
   - Example: "Move ₹60,000 to your bank account. Your cash covers 2.9 months. Aim for 3 to 6."
   - Buttons: [Do it] [Why?] [Not now].
2. **Goals at a glance:** one ring per goal with a one-word verdict and "1 of 3 goals on track". The combined 20-year chart moves behind "See over time".
3. **Goal list:** tapping a goal opens its own screen. Each row shows amount, date, verdict and one line on what fixes it.
4. **Goal screen:**
   - what you'll have vs what you need;
   - the three moves, each showing its effect;
   - "Why we say this";
   - **What would change this advice** (new): e.g. "We'd move this goal to safer funds once it's less than 3 years away";
   - notes.
5. **Advice log** (new): every recommendation NoBroke has made. Each entry shows the date, the reason, and what you did (done / skipped). Once it's measurable, it also shows what happened after.
6. **Something changed?** (new): chips for new job, marriage, baby, big expense, job loss, parents' hospital bill. Each opens a re-plan preview showing which goals move and by how much.
7. **Remove from Plan:** the portfolio summary (`PortfolioGlimpse`) and the second risk meter. Both live on Portfolio.

### 7.4 Portfolio page (top to bottom)
1. **Your mix in one line** plus your risk level (the only place the risk meter appears).
2. **Money by goal** (new): which part of the portfolio funds which goal. Goals under about 3 years show in safer funds; show the move, or suggest it.
3. **The funds:** one line on why each fund is there, and its yearly cost in rupees (expense ratio × amount).
4. **Past returns** in plain words (see 7.2).
5. **Change your mix** (Steady / Balanced / Bold) with a live preview of goal impact before applying, e.g. "Laptop: March 2028 → May 2028".
6. **Second opinion** (new): "Someone selling you a policy, a ULIP or a fund? Tell us what it is." The answer is a plain verdict on costs, lock-in and what it does to your goals. No product sales, ever.
7. **Build your own mix (advanced):** collapsed by default.

### 7.5 Money page (top to bottom)
1. **Net worth** = what you own minus what you owe (needs task 3.2), plus the change since last month.
2. **Safe to invest this month** (new): money in minus spending, upcoming bills (EMIs, premiums, school fees) and any emergency-fund top-up. Show it as one number with a button: "Invest ₹X".
3. **Money calendar** (new): SIP dates, EMIs, insurance premiums, fees, goal dates and tax dates on one timeline. Start with manual entries; bank linking can come later.
4. **What you own** by type (EPF/PPF, FDs, mutual funds, stocks, gold, property) and **what you owe** (loans).
5. **Every month:** money in, spent, invested. Changes show their effect on goals live.
6. **Need money now?** (new): enter an amount and see which holdings to use first. Order by the least tax, no exit load, and the least damage to your goals.
7. **Remove** the "Wealth tools" list of Soon items.

### 7.6 Links between the three pages

**Today:**
- Plan links to Money four ways: "Add money", "Review cash", "Invest more" and "Manage holdings". All four land on the top of Money, and the person has to find the field themselves.
- Plan links to Portfolio once ("Manage →").
- Portfolio and Money only link back to Plan ("See the plan →"). There's no link between Portfolio and Money.

**Change:**

| From | Tap | Opens |
|---|---|---|
| Plan | Add money | Sheet on Plan: "Add to cash" or "Add an investment" |
| Plan advisor note | Add to cash | Cash amount sheet on Plan, showing the new cash runway live |
| Goal screen | Put in more | Monthly amount sheet showing each goal's new date live |
| Goal screen | Where this money is invested | Portfolio, scrolled to that goal in "Money by goal" |
| Portfolio | A fund you already own | Money, that holding highlighted |
| Portfolio | Change your mix | Inline preview of goal impact; "See your goals" goes to Plan |
| Money | A row in "By goal" | That goal's screen on Plan |
| Money | Invest ₹X (safe to invest) | Monthly amount sheet (the same one as "Put in more") |

- **Implementation:** add `actions.openSheet(kind, params)` and `actions.setTab(tab, { focus: sectionId })`. The second scrolls to the section and highlights it for a moment.
- **Accept:**
  - No link lands at the top of a tab when it's about one field.
  - Every sheet shows the effect on goals before saving.
  - The Plan page has no duplicate "Manage" links left.

### 7.7 Advisory-first features rivals don't offer
Checked on 26 Sep 2026 against INDmoney, Kuvera, ET Money, Scripbox, Dezerv, PowerUp Money and Groww. All of them already offer portfolio health checks, fund ratings, family net worth, tax harvesting or smart withdrawal, and (Groww, INDmoney) AI Q&A over your portfolio. None of the pages checked describe the items below. Build them in this order:

1. **Do this next**, with the effect shown (7.3.1).
2. **What would change this advice** on every recommendation (7.3.4).
3. **Money by goal**, with near goals made safer inside one portfolio (7.4.2).
4. **Safe to invest this month** (7.5.2).
5. **Advice log** (7.3.5).
6. **Something changed?** life-event re-plans (7.3.6).
7. **Money calendar** (7.5.3).
8. **Need money now?**, ranked by tax, exit load and goal damage (7.5.6).
9. **Second opinion** on products being sold to you (7.4.6). Needs the AI plus product data; confirm with the founders before building.

---

## Founder decisions (not for Claude Code)

- **Advisory-first needs a licence decision.** Every page footer still says "not investment advice", and the landing page says NoBroke is not SEBI-registered. Decide between registering as an RIA and partnering with one before shipping "Do this next" and "Advice log" as advice.

- **WhatsApp help number:** `src/components/SupportPill.tsx` line 7 is empty, so the help pill never shows.
- **Password reset:** the sign-in sheet says "Password reset coming soon". Reset needs an email provider; Google or phone-OTP sign-in needs OAuth or SMS keys.
- **Pricing copy:** free tier and student price.
- **Registration wording** for the trust block.
- **Production deploy:** fixed. nobroke.in now serves the 25 Sep title and share image. Confirm that #11 (Phase 1) is live too.
- **In-app investing:** needs a partner or licence decision.

## Definition of done (every phase)

- `npm test` and `npm run build` pass.
- All three personas walked at 360px and 390px: no overflow, nothing clipped, contrast rules met.
- Before and after screenshots attached to the PR.
- Anything skipped or blocked is listed in the PR description, with the reason.
