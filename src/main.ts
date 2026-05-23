import { computePlan } from "./lib/finance.js";
import { generateInsights } from "./lib/copilot.js";
import { clear, el, qs } from "./ui/dom.js";
import { getState, subscribe, toPlanInputs } from "./ui/state.js";
import { mountGoalSelector } from "./ui/components/goalSelector.js";
import { mountGoalParameters } from "./ui/components/goalParameters.js";
import { mountPortfolioBuilder } from "./ui/components/portfolioBuilder.js";
import { renderMetrics } from "./ui/components/metricsPanel.js";
import { renderCopilot } from "./ui/components/copilotPanel.js";
import { renderChart } from "./ui/chart.js";

function card(title: string, subtitle: string, body: HTMLElement, extraClass = ""): HTMLElement {
  return el("section", { class: "card " + extraClass }, [
    el("div", { class: "card-head" }, [
      el("h2", { class: "card-title", text: title }),
      el("span", { class: "card-sub", text: subtitle }),
    ]),
    body,
  ]);
}

function buildShell(appRoot: HTMLElement): {
  goalSelector: HTMLElement;
  params: HTMLElement;
  portfolio: HTMLElement;
  planTitle: HTMLElement;
  metrics: HTMLElement;
  chart: HTMLElement;
  copilot: HTMLElement;
} {
  clear(appRoot);

  // Top navigation
  const nav = el("header", { class: "nav" }, [
    el("div", { class: "nav-brand" }, [
      el("span", { class: "logo-mark", text: "◆" }),
      el("span", { class: "logo-word", text: "NoBroke" }),
    ]),
    el("nav", { class: "nav-links" }, [
      el("a", { class: "nav-link", href: "#planner", text: "Planner" }),
      el("a", { class: "nav-link", href: "#how", text: "How it works" }),
      el("a", { class: "btn-primary nav-cta", href: "#waitlist", text: "Join waitlist" }),
    ]),
  ]);

  // Hero
  const hero = el("section", { class: "hero" }, [
    el("span", { class: "hero-eyebrow", text: "AI-powered financial planning & wealth copilot" }),
    el("h1", { class: "hero-title", text: "Plan any goal. Watch your money's future change in real time." }),
    el("p", {
      class: "hero-lede",
      text: "Set a goal, build a portfolio by dragging assets, and NoBroke instantly shows the corpus you'll reach, your projected XIRR, and whether you're on track — inflation included.",
    }),
    el("div", { class: "hero-stats" }, [
      el("div", { class: "hero-badge" }, [el("strong", { text: "₹220–300B" }), el("span", { text: "serviceable market (SAM)" })]),
      el("div", { class: "hero-badge" }, [el("strong", { text: "35–40M" }), el("span", { text: "mass-affluent Indians" })]),
      el("div", { class: "hero-badge" }, [el("strong", { text: "Goal-based" }), el("span", { text: "corpus + XIRR engine" })]),
    ]),
  ]);

  // Planner section
  const goalSelector = el("div", { class: "goal-selector" });
  const params = el("div", { class: "params" });
  const portfolio = el("div", { class: "portfolio-builder" });
  const planTitle = el("span", { class: "plan-title", text: getState().goalName });
  const metrics = el("div", { class: "metrics" });
  const chart = el("div", { class: "chart-wrap" });
  const copilot = el("div", { class: "copilot" });

  const leftCol = el("div", { class: "planner-col left" }, [
    card("1 · Pick a goal", "Or customize your own", goalSelector),
    card("2 · Set the details", "Drag the sliders", params),
    card("3 · Build your portfolio", "Drag assets or use a model", portfolio, "card-portfolio"),
  ]);

  const rightCol = el("div", { class: "planner-col right" }, [
    el("section", { class: "card card-results" }, [
      el("div", { class: "card-head" }, [
        el("h2", { class: "card-title" }, [document.createTextNode("Your plan for "), planTitle]),
        el("span", { class: "card-sub", text: "Updates live as you tweak" }),
      ]),
      metrics,
    ]),
    card("Projected growth", "Corpus vs. inflation-adjusted target", chart),
    el("section", { class: "card card-copilot" }, [copilot]),
  ]);

  const planner = el("section", { class: "planner", id: "planner" }, [
    el("div", { class: "planner-head" }, [
      el("h2", { class: "section-title", text: "Your financial planning copilot" }),
      el("p", { class: "section-sub", text: "Everything recalculates the moment you change a goal, a slider, or your asset mix." }),
    ]),
    goalSelector,
    el("div", { class: "planner-grid" }, [leftCol, rightCol]),
  ]);

  // Footer
  const footer = el("footer", { class: "footer", id: "waitlist" }, [
    el("div", { class: "footer-cta" }, [
      el("h3", { class: "footer-title", text: "Be the first to go NoBroke." }),
      el("p", { class: "footer-sub", text: "Join the waitlist for early access to your AI wealth copilot." }),
      el("form", { class: "waitlist-form" }, [
        el("input", { class: "waitlist-input", type: "email", placeholder: "you@email.com", "aria-label": "Email" }),
        el("button", { class: "btn-primary", type: "submit", text: "Request access" }),
      ]),
    ]),
    el("p", {
      class: "disclaimer",
      text: "NoBroke is an early prototype. Projections are illustrative, use simplified assumptions, and are not investment advice.",
    }),
  ]);

  appRoot.append(nav, el("main", { class: "main" }, [hero, planner]), footer);

  // Prevent the demo waitlist form from navigating away.
  const form = qs<HTMLFormElement>(".waitlist-form", footer);
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const input = qs<HTMLInputElement>(".waitlist-input", form);
    const btn = qs<HTMLButtonElement>("button", form);
    if (input.value.trim()) {
      btn.textContent = "You're on the list ✓";
      input.value = "";
      input.disabled = true;
    }
  });

  return { goalSelector, params, portfolio, planTitle, metrics, chart, copilot };
}

function main(): void {
  const appRoot = qs<HTMLElement>("#app");
  const mounts = buildShell(appRoot);

  mountGoalSelector(mounts.goalSelector);
  mountGoalParameters(mounts.params);
  mountPortfolioBuilder(mounts.portfolio);

  function render(): void {
    const s = getState();
    const inputs = toPlanInputs(s);
    const result = computePlan(inputs);
    mounts.planTitle.textContent = s.goalName || "your goal";
    renderMetrics(mounts.metrics, result, s);
    renderChart(mounts.chart, result);
    renderCopilot(mounts.copilot, generateInsights(inputs, result));
  }

  subscribe(render);
  render();
}

main();
