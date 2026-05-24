import { formatINR, formatPct, formatYears } from "../../lib/format.js";
import { clear, el } from "../dom.js";
function statCard(label, value, sub, cls = "") {
    return el("div", { class: "stat" + (cls ? " " + cls : "") }, [
        el("span", { class: "stat-label", text: label }),
        el("span", { class: "stat-value", text: value }),
        el("span", { class: "stat-sub", text: sub }),
    ]);
}
function progressRing(progress, onTrack) {
    const pct = Math.max(0, Math.min(1, progress));
    const r = 34;
    const c = 2 * Math.PI * r;
    const dash = c * pct;
    const wrap = el("div", { class: "ring-wrap" });
    wrap.innerHTML = `
    <svg viewBox="0 0 80 80" class="ring" role="img" aria-label="progress to goal">
      <circle cx="40" cy="40" r="${r}" class="ring-track"/>
      <circle cx="40" cy="40" r="${r}" class="ring-fill ${onTrack ? "on" : "off"}"
        stroke-dasharray="${dash.toFixed(1)} ${(c - dash).toFixed(1)}" transform="rotate(-90 40 40)"/>
      <text x="40" y="45" text-anchor="middle" class="ring-text">${Math.round(pct * 100)}%</text>
    </svg>`;
    return wrap;
}
export function renderMetrics(container, r, s) {
    clear(container);
    const hero = el("div", { class: "hero-stat " + (r.onTrack ? "on-track" : "off-track") }, [
        el("div", { class: "hero-stat-main" }, [
            el("div", { class: "hero-stat-top" }, [
                el("span", { class: "stat-label", text: "Projected corpus at goal" }),
                el("span", { class: "pill " + (r.onTrack ? "pill-pos" : "pill-neg"), text: r.onTrack ? "On track" : "Catching up" }),
            ]),
            el("span", { class: "hero-stat-value", text: formatINR(r.projectedCorpus) }),
            el("span", { class: "stat-sub", text: `in ${formatYears(s.goals.find((g) => g.id === s.currentGoalId)?.horizonYears ?? 0)} • ${formatINR(r.realProjectedCorpus)} in today's value` }),
        ]),
        progressRing(r.progress, r.onTrack),
    ]);
    const gapCard = statCard(r.onTrack ? "Surplus over target" : "Shortfall vs target", formatINR(Math.abs(r.gap)), r.onTrack ? "you beat the goal" : `bridge with ${formatINR(r.requiredSip)}/mo`, r.onTrack ? "good" : "bad");
    const grid = el("div", { class: "stat-grid" }, [
        statCard("Target (inflation-adjusted)", formatINR(r.requiredCorpus), `${formatINR(s.goals.find((g) => g.id === s.currentGoalId)?.targetToday ?? 0)} today @ ${formatPct(s.inflation, 0)}`),
        gapCard,
        statCard("Expected return p.a.", formatPct(r.blendedReturn), "blended across portfolio"),
        statCard("Projected XIRR", formatPct(r.xirr), "money-weighted return"),
        statCard("Total invested", formatINR(r.totalInvested), `${formatINR(r.projectedCorpus - r.totalInvested)} is growth`),
        statCard("Portfolio risk", formatPct(r.blendedVolatility, 0), "annualized volatility"),
    ]);
    container.append(hero, grid);
}
//# sourceMappingURL=metricsPanel.js.map