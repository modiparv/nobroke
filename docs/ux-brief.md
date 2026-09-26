# NoBroke: UX and product fixes (brief for Claude Code)

**Status (26 Sep 2026): Phase 1 shipped in #11 and verified.** All 293 tests pass, and all six Phase 1 fixes show correctly on screen. Next: Phase 1b (below), then Phase 2.

Source: persona testing of `main` at `6238043` (25 Sep 2026), re-checked at `a0f550e` (26 Sep) with a 20-year-old student and a 40-year-old salaried parent, on 360px and 390px phone screens with the real fonts. Every issue below was reproduced in the app or in the code. File paths and line numbers are from that commit; line numbers are approximate.

## How to use this brief

1. Replace `docs/ux-brief.md` in the repo with this file.
2. In Claude Code, start with:
   > Read docs/ux-brief.md. Phase 1 is done. Do Phase 1b, one task per commit. Run `npm test` and `npm run build` after each task. Stop and report when Phase 1b is done.
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
  - opens on "0 of 3 goals on track", with all three goals marked "Far short", on the default goal prices (trip ₹2 L, laptop ₹1 L);
  - with his real prices (trip ₹20,000, laptop ₹70,000) he gets "1 of 3", although 2 of 3 is reachable (task 1b.1).
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

## Phase 1b: follow-ups found while verifying Phase 1 (do next)

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

## Founder decisions (not for Claude Code)

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
