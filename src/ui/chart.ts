import type { PlanResult } from "../types.js";
import { formatINR, formatYears } from "../lib/format.js";
import { qs } from "./dom.js";

const W = 760;
const H = 380;
const PAD = { top: 28, right: 24, bottom: 42, left: 66 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

export function renderChart(container: HTMLElement, r: PlanResult): void {
  const series = r.series;
  const maxX = Math.max(1, r.months);
  const maxY = Math.max(1, Math.max(r.projectedCorpus, r.requiredCorpus) * 1.12);

  const xOf = (month: number) => PAD.left + (month / maxX) * plotW;
  const yOf = (val: number) => PAD.top + plotH - (val / maxY) * plotH;

  const linePath = (key: "value" | "invested") =>
    series.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.month).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(" ");

  const valuePath = linePath("value");
  const investedPath = linePath("invested");
  const areaPath = `${valuePath} L${xOf(maxX).toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${xOf(0).toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`;

  const yTicks = 5;
  let grid = "";
  let yLabels = "";
  for (let i = 0; i <= yTicks; i++) {
    const val = (maxY / yTicks) * i;
    const y = yOf(val);
    grid += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${PAD.left + plotW}" y2="${y.toFixed(1)}" class="c-grid"/>`;
    yLabels += `<text x="${PAD.left - 12}" y="${(y + 4).toFixed(1)}" class="c-axis" text-anchor="end">${formatINR(val)}</text>`;
  }

  const tickCount = Math.min(8, Math.max(2, Math.round(maxX / 12)));
  let xLabels = "";
  for (let i = 0; i <= tickCount; i++) {
    const month = Math.round((maxX / tickCount) * i);
    xLabels += `<text x="${xOf(month).toFixed(1)}" y="${(PAD.top + plotH + 24).toFixed(1)}" class="c-axis" text-anchor="middle">${formatYears(month / 12)}</text>`;
  }

  const ty = yOf(r.requiredCorpus);
  const targetLine = `<line x1="${PAD.left}" y1="${ty.toFixed(1)}" x2="${PAD.left + plotW}" y2="${ty.toFixed(1)}" class="c-target"/>
    <text x="${PAD.left + plotW}" y="${(ty - 9).toFixed(1)}" class="c-target-label" text-anchor="end">🎯 Target ${formatINR(r.requiredCorpus)}</text>`;

  let reachMarker = "";
  if (r.goalReachedMonth !== null && r.goalReachedMonth < r.months && r.goalReachedMonth > 0) {
    const gx = xOf(r.goalReachedMonth);
    reachMarker = `<line x1="${gx.toFixed(1)}" y1="${PAD.top}" x2="${gx.toFixed(1)}" y2="${(PAD.top + plotH).toFixed(1)}" class="c-reach"/>
      <text x="${(gx + 6).toFixed(1)}" y="${(PAD.top + 14).toFixed(1)}" class="c-reach-label">reached ${formatYears(r.goalReachedMonth / 12)}</text>`;
  }

  const endX = xOf(maxX);
  const endY = yOf(r.projectedCorpus);
  const endDot = r.onTrack
    ? `<circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="5" fill="#0a0a0a"/>`
    : `<circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="5" fill="#ffffff" stroke="#0a0a0a" stroke-width="2"/>`;

  container.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Projected corpus growth over time">
    <defs>
      <linearGradient id="nb-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a0a0a" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#0a0a0a" stop-opacity="0.01"/>
      </linearGradient>
    </defs>
    ${grid}${yLabels}${xLabels}
    <path d="${areaPath}" fill="url(#nb-area)"/>
    <path d="${investedPath}" class="c-invested"/>
    <path d="${valuePath}" class="c-value"/>
    ${targetLine}${reachMarker}
    ${endDot}
    <g class="c-hover" style="opacity:0">
      <line class="c-hover-line" x1="0" y1="${PAD.top}" x2="0" y2="${(PAD.top + plotH).toFixed(1)}"/>
      <circle class="c-hover-dot" r="4.5"/>
    </g>
    <rect x="${PAD.left}" y="${PAD.top}" width="${plotW}" height="${plotH}" fill="transparent" class="c-capture"/>
  </svg>
  <div class="chart-tooltip" style="opacity:0"></div>
  <div class="chart-legend">
    <span class="lg"><i class="swatch" style="background:#0a0a0a"></i>Projected value</span>
    <span class="lg"><i class="swatch dash" style="background:#bfbfbf"></i>Amount invested</span>
    <span class="lg"><i class="swatch" style="background:#0a0a0a"></i>Inflation-adjusted target</span>
  </div>`;

  // Hover interaction
  const svg = qs<SVGSVGElement>(".chart-svg", container);
  const capture = qs<SVGRectElement>(".c-capture", container);
  const hover = qs<SVGGElement>(".c-hover", container);
  const hLine = qs<SVGLineElement>(".c-hover-line", container);
  const hDot = qs<SVGCircleElement>(".c-hover-dot", container);
  const tip = qs<HTMLDivElement>(".chart-tooltip", container);

  capture.addEventListener("mousemove", (ev) => {
    const rect = svg.getBoundingClientRect();
    const scale = W / rect.width;
    const px = (ev.clientX - rect.left) * scale;
    const frac = Math.min(1, Math.max(0, (px - PAD.left) / plotW));
    const month = Math.round(frac * maxX);
    const p = series[Math.min(series.length - 1, month)];
    const cx = xOf(p.month);
    const cy = yOf(p.value);
    hover.style.opacity = "1";
    hLine.setAttribute("x1", cx.toFixed(1));
    hLine.setAttribute("x2", cx.toFixed(1));
    hDot.setAttribute("cx", cx.toFixed(1));
    hDot.setAttribute("cy", cy.toFixed(1));
    tip.style.opacity = "1";
    tip.style.left = `${cx / scale}px`;
    tip.style.top = `${cy / scale - 10}px`;
    tip.innerHTML = `<strong>${formatYears(p.year)}</strong><span>Value ${formatINR(p.value)}</span><span class="muted">Invested ${formatINR(p.invested)}</span>`;
  });
  capture.addEventListener("mouseleave", () => {
    hover.style.opacity = "0";
    tip.style.opacity = "0";
  });
}
