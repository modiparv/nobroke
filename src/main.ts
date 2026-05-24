import { computePlan } from "./lib/finance.js";
import { generateInsights } from "./lib/copilot.js";
import { clear, el, qs } from "./ui/dom.js";
import { currentGoal, getState, startOnboarding, subscribe, toPlanInputs } from "./ui/state.js";
import { mountLanding } from "./ui/components/landing.js";
import { mountOnboarding } from "./ui/components/onboarding.js";
import { mountGoalSelector } from "./ui/components/goalSelector.js";
import { mountGoalParameters } from "./ui/components/goalParameters.js";
import { mountPortfolioBuilder } from "./ui/components/portfolioBuilder.js";
import { mountChatPanel } from "./ui/components/chatPanel.js";
import { mountAggregationPanel } from "./ui/components/aggregationPanel.js";
import { renderMetrics } from "./ui/components/metricsPanel.js";
import { renderCopilot } from "./ui/components/copilotPanel.js";
import { renderChart } from "./ui/chart.js";

function card(title: string, subtitle: string, body: HTMLElement, extraClass = ""): HTMLElement {
  return el("section", { class: "card " + extraClass }, [
    el("div", { class: "card-head" }, [el("h2", { class: "card-title", text: title }), el("span", { class: "card-sub", text: subtitle })]),
    body,
  ]);
}

function mountDashboard(root: HTMLElement): void {
  clear(root);

  const newPlanBtn = el("button", { class: "btn-ghost", type: "button", text: "＋ New plan" });
  newPlanBtn.addEventListener("click", startOnboarding);
  const nav = el("header", { class: "nav" }, [
    el("div", { class: "nav-brand" }, [el("span", { class: "logo-mark", text: "◆" }), el("span", { class: "logo-word", text: "NoBroke" })]),
    el("nav", { class: "nav-links" }, [newPlanBtn]),
  ]);

  const goalSelector = el("div", { class: "goal-selector" });
  const params = el("div", { class: "params" });
  const portfolio = el("div", { class: "portfolio-builder" });
  const metrics = el("div", { class: "metrics" });
  const chart = el("div", { class: "chart-wrap" });
  const chat = el("div", { class: "chat" });
  const copilot = el("div", { class: "copilot" });
  const aggregation = el("div", { class: "aggregation" });
  const planTitle = el("span", { class: "plan-title", text: "" });

  const leftCol = el("div", { class: "planner-col" }, [
    card("Goal details", "Tune the plan", params),
    card("Build your portfolio", "Drag products · the main event", portfolio, "card-portfolio"),
  ]);
  const rightCol = el("div", { class: "planner-col" }, [
    el("section", { class: "card card-results" }, [
      el("div", { class: "card-head" }, [
        el("h2", { class: "card-title" }, [document.createTextNode("Plan for "), planTitle]),
        el("span", { class: "card-sub", text: "Live" }),
      ]),
      metrics,
      chart,
    ]),
    el("section", { class: "card card-chat" }, [chat]),
    el("section", { class: "card card-copilot" }, [copilot]),
  ]);

  const planner = el("section", { class: "planner" }, [
    el("div", { class: "planner-head" }, [
      el("h1", { class: "section-title", text: "Your money, matched." }),
      el("p", { class: "section-sub", text: "Switch goals, drag your portfolio, and ask AURA anything — everything recalculates instantly." }),
    ]),
    goalSelector,
    el("div", { class: "planner-grid" }, [leftCol, rightCol]),
    card("Connect your accounts", "Auto-import existing investments", aggregation, "card-agg"),
  ]);

  root.append(nav, el("main", { class: "main" }, [planner]));

  mountGoalSelector(goalSelector);
  mountGoalParameters(params);
  mountPortfolioBuilder(portfolio);
  mountChatPanel(chat);
  mountAggregationPanel(aggregation);

  function render(): void {
    const s = getState();
    if (s.screen !== "dashboard") return;
    const result = computePlan(toPlanInputs(s));
    planTitle.textContent = currentGoal(s)?.name ?? "your goal";
    renderMetrics(metrics, result, s);
    renderChart(chart, result);
    renderCopilot(copilot, generateInsights(toPlanInputs(s), result));
  }

  render();
  subscribe(render);
}

function main(): void {
  const app = qs<HTMLElement>("#app");
  let lastScreen = "";
  function route(): void {
    const s = getState();
    if (s.screen === lastScreen) return;
    lastScreen = s.screen;
    if (s.screen === "landing") mountLanding(app);
    else if (s.screen === "onboarding") mountOnboarding(app);
    else mountDashboard(app);
  }
  route();
  subscribe(route);
}

main();
