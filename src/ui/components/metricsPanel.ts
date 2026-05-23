import type { PlanResult } from "../../types.js";
import type { AppState } from "../state.js";
import { formatINR, formatPct, formatYears } from "../../lib/format.js";
import { clear, el } from "../dom.js";

function statCard(label: string, value: string, sub: string, cls = ""): HTMLElement {
  return el("div", { class: "stat" + (cls ? " " + cls : "") }, [
    el("span", { class: "stat-label", text: label }),
    el("span", { class: "stat-value", text: value }),
    el("span", { class: "stat-sub", text: sub }),
  ]);
}

export function renderMetrics(container: HTMLElement, r: PlanResult, s: AppState): void {
  clear(container);

  const heroClass = r.onTrack ? "hero-stat on-track" : "hero-stat off-track";
  const hero = el("div", { class: heroClass }, [
    el("div", { class: "hero-stat-top" }, [
      el("span", { class: "stat-label", text: "Projected corpus at goal" }),
      el("span", {
        class: "pill " + (r.onTrack ? "pill-pos" : "pill-neg"),
        text: r.onTrack ? "On track" : "Needs attention",
      }),
    ]),
    el("span", { class: "hero-stat-value", text: formatINR(r.projectedCorpus) }),
    el("span", {
      class: "stat-sub",
      text: `in ${formatYears(s.horizonYears)} • ${formatINR(r.realProjectedCorpus)} in today's value`,
    }),
  ]);

  const gapCard = statCard(
    r.onTrack ? "Surplus over target" : "Shortfall vs target",
    formatINR(Math.abs(r.gap)),
    r.onTrack ? "you beat the goal" : `bridge with ${formatINR(r.requiredSip)}/mo SIP`,
    r.onTrack ? "good" : "bad",
  );

  const grid = el("div", { class: "stat-grid" }, [
    statCard("Target (inflation-adjusted)", formatINR(r.requiredCorpus), `${formatINR(s.targetToday)} today @ ${formatPct(s.inflation, 0)}`),
    gapCard,
    statCard("Expected return p.a.", formatPct(r.blendedReturn), "blended across portfolio"),
    statCard("Projected XIRR", formatPct(r.xirr), "money-weighted return"),
    statCard("Total invested", formatINR(r.totalInvested), `${formatINR(r.projectedCorpus - r.totalInvested)} is growth`),
    statCard("Portfolio risk", formatPct(r.blendedVolatility, 0), "annualized volatility"),
  ]);

  container.append(hero, grid);
}
