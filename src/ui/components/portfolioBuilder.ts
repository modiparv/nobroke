import type { Allocation } from "../../types.js";
import { CATEGORIES, CATEGORY_MAP, PRODUCTS_BY_CATEGORY, PRODUCT_MAP } from "../../lib/assets.js";
import { MODEL_PORTFOLIOS, autoAllocation } from "../../lib/portfolios.js";
import { allocationTotal, blendedReturn, blendedVolatility, categoryWeights, normalizedWeights } from "../../lib/finance.js";
import { formatPct } from "../../lib/format.js";
import { clear, el } from "../dom.js";
import { currentGoal, getState, subscribe, updateCurrentGoal } from "../state.js";

function riskLabel(vol: number): string {
  if (vol < 0.04) return "Low";
  if (vol < 0.1) return "Moderate";
  if (vol < 0.16) return "High";
  return "Very High";
}

function alloc(): Allocation {
  return { ...(currentGoal()?.allocation ?? {}) };
}
function addProduct(id: string): void {
  const a = alloc();
  if (!(id in a)) {
    a[id] = 10;
    updateCurrentGoal({ allocation: a, activeProfile: null });
  }
}
function removeProduct(id: string): void {
  const a = alloc();
  delete a[id];
  updateCurrentGoal({ allocation: a, activeProfile: null });
}
function setWeight(id: string, w: number): void {
  const a = alloc();
  a[id] = w;
  updateCurrentGoal({ allocation: a, activeProfile: null });
}
function balance(): void {
  const w = normalizedWeights(alloc());
  if (!w.length) return;
  const a: Allocation = {};
  let sum = 0;
  for (const { id, weight } of w) {
    a[id] = Math.round(weight * 100);
    sum += a[id];
  }
  const diff = 100 - sum;
  if (diff !== 0) a[[...w].sort((x, y) => y.weight - x.weight)[0].id] += diff;
  updateCurrentGoal({ allocation: a });
}

export function mountPortfolioBuilder(root: HTMLElement): void {
  clear(root);

  // Model buttons
  const modelRow = el("div", { class: "pb-models" });
  const modelButtons: Array<{ key: string; btn: HTMLButtonElement }> = [];
  (["conservative", "balanced", "aggressive"] as const).forEach((key) => {
    const m = MODEL_PORTFOLIOS[key];
    const btn = el("button", { class: "model-btn", type: "button" }, [
      el("span", { class: "model-name", text: m.label }),
      el("span", { class: "model-tag", text: m.tagline }),
    ]) as HTMLButtonElement;
    btn.addEventListener("click", () => updateCurrentGoal({ allocation: { ...m.allocation }, activeProfile: key }));
    modelButtons.push({ key, btn });
    modelRow.append(btn);
  });
  const autoBtn = el("button", { class: "model-btn model-auto", type: "button" }, [
    el("span", { class: "model-name", text: "✨ AURA" }),
    el("span", { class: "model-tag", text: "matched to goal" }),
  ]) as HTMLButtonElement;
  autoBtn.addEventListener("click", () => {
    const g = currentGoal();
    const auto = autoAllocation(g?.horizonYears ?? 5);
    updateCurrentGoal({ allocation: { ...auto.allocation }, activeProfile: auto.profile });
  });
  modelRow.append(autoBtn);

  // Library grouped by category
  const library = el("div", { class: "pb-library" });
  library.append(el("span", { class: "pb-section-label", text: "Asset library — drag a product into your portfolio" }));
  const libCards = new Map<string, HTMLButtonElement>();
  for (const cat of CATEGORIES) {
    const group = el("div", { class: "lib-group" });
    group.append(
      el("div", { class: "lib-group-head" }, [
        el("span", { class: "cat-dot", style: `background:${cat.shade}` }),
        el("span", { class: "lib-group-name", text: cat.name }),
      ]),
    );
    const chips = el("div", { class: "lib-chips" });
    for (const p of PRODUCTS_BY_CATEGORY[cat.id]) {
      const card = el("button", { class: "asset-card", type: "button", draggable: "true", "data-id": p.id, title: p.description }, [
        el("div", { class: "asset-info" }, [
          el("span", { class: "asset-name", text: p.shortName }),
          el("span", { class: "asset-meta", text: `${formatPct(p.expectedReturn, 0)} · ${p.risk}` }),
        ]),
        el("span", { class: "asset-add", text: "+" }),
      ]) as HTMLButtonElement;
      card.addEventListener("click", () => (p.id in (currentGoal()?.allocation ?? {}) ? removeProduct(p.id) : addProduct(p.id)));
      card.addEventListener("dragstart", (ev) => {
        ev.dataTransfer?.setData("text/plain", p.id);
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "copy";
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      libCards.set(p.id, card);
      chips.append(card);
    }
    group.append(chips);
    library.append(group);
  }

  // Portfolio drop zone
  const totalBadge = el("span", { class: "total-badge" });
  const allocBar = el("div", { class: "alloc-bar" });
  const catLegend = el("div", { class: "cat-legend" });
  const list = el("div", { class: "portfolio-list" });
  const returnReadout = el("span", { class: "readout-value" });
  const riskReadout = el("span", { class: "readout-value" });
  const balanceBtn = el("button", { class: "balance-btn", type: "button", text: "Balance to 100%" }) as HTMLButtonElement;
  balanceBtn.addEventListener("click", balance);
  const readout = el("div", { class: "pb-readout" }, [
    el("div", { class: "readout" }, [el("span", { class: "readout-label", text: "Expected return" }), returnReadout]),
    el("div", { class: "readout" }, [el("span", { class: "readout-label", text: "Risk" }), riskReadout]),
    balanceBtn,
  ]);

  const portfolio = el("div", { class: "pb-portfolio" }, [
    el("div", { class: "pb-portfolio-head" }, [el("span", { class: "pb-section-label", text: "Your portfolio" }), totalBadge]),
    allocBar,
    catLegend,
    list,
    readout,
  ]);
  portfolio.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
    portfolio.classList.add("drag-over");
  });
  portfolio.addEventListener("dragleave", (ev) => {
    if (!portfolio.contains(ev.relatedTarget as Node)) portfolio.classList.remove("drag-over");
  });
  portfolio.addEventListener("drop", (ev) => {
    ev.preventDefault();
    portfolio.classList.remove("drag-over");
    const id = ev.dataTransfer?.getData("text/plain");
    if (id && PRODUCT_MAP[id]) addProduct(id);
  });

  root.append(modelRow, el("div", { class: "pb-columns" }, [library, portfolio]));

  // Rendering
  const rowSliders = new Map<string, HTMLInputElement>();
  const rowPcts = new Map<string, HTMLElement>();
  let lastKey = "";

  function rebuildList(): void {
    clear(list);
    rowSliders.clear();
    rowPcts.clear();
    const a = currentGoal()?.allocation ?? {};
    const ids = Object.keys(a);
    if (!ids.length) {
      list.append(el("div", { class: "portfolio-empty", text: "Drag products here, or tap a model above." }));
      portfolio.classList.add("empty");
      return;
    }
    portfolio.classList.remove("empty");
    // Group rows by category order
    const ordered = ids.slice().sort((x, y) => {
      const cx = CATEGORIES.findIndex((c) => c.id === PRODUCT_MAP[x]?.categoryId);
      const cy = CATEGORIES.findIndex((c) => c.id === PRODUCT_MAP[y]?.categoryId);
      return cx - cy;
    });
    for (const id of ordered) {
      const p = PRODUCT_MAP[id];
      if (!p) continue;
      const shade = CATEGORY_MAP[p.categoryId]?.shade ?? "#000";
      const slider = el("input", { class: "prow-slider", type: "range", min: "0", max: "100", step: "1", "aria-label": p.name + " weight" }) as HTMLInputElement;
      slider.style.accentColor = shade;
      slider.addEventListener("input", () => setWeight(id, parseFloat(slider.value)));
      const pct = el("span", { class: "prow-pct" });
      const remove = el("button", { class: "prow-remove", type: "button", title: "Remove", text: "×" });
      remove.addEventListener("click", () => removeProduct(id));
      list.append(
        el("div", { class: "prow", "data-id": id }, [
          el("span", { class: "cat-dot", style: `background:${shade}` }),
          el("div", { class: "prow-info" }, [
            el("span", { class: "prow-name", text: p.shortName }),
            el("span", { class: "prow-meta", text: `${CATEGORY_MAP[p.categoryId]?.name} · ${formatPct(p.expectedReturn, 0)}` }),
          ]),
          slider,
          pct,
          remove,
        ]),
      );
      rowSliders.set(id, slider);
      rowPcts.set(id, pct);
    }
  }

  function updateVisuals(): void {
    const g = currentGoal();
    const a = g?.allocation ?? {};
    const total = allocationTotal(a);
    const weights = normalizedWeights(a);
    const balanced = Math.abs(total - 100) < 0.5;

    totalBadge.textContent = weights.length ? (balanced ? "100% ✓" : `${Math.round(total)}%`) : "empty";
    totalBadge.className = "total-badge " + (weights.length && balanced ? "ok" : weights.length ? "warn" : "");
    balanceBtn.disabled = balanced || weights.length === 0;

    clear(allocBar);
    if (!weights.length) allocBar.append(el("div", { class: "alloc-empty" }));
    else
      for (const { id, weight } of weights) {
        const shade = CATEGORY_MAP[PRODUCT_MAP[id]?.categoryId ?? ""]?.shade ?? "#999";
        allocBar.append(el("div", { class: "alloc-seg", style: `width:${(weight * 100).toFixed(2)}%;background:${shade}`, title: `${PRODUCT_MAP[id]?.shortName} ${(weight * 100).toFixed(0)}%` }));
      }

    // Category legend
    clear(catLegend);
    const cw = categoryWeights(a);
    for (const cat of CATEGORIES) {
      const w = cw[cat.id] ?? 0;
      if (w <= 0) continue;
      catLegend.append(
        el("span", { class: "cat-legend-item" }, [
          el("span", { class: "cat-dot sm", style: `background:${cat.shade}` }),
          el("span", { class: "cat-legend-name", text: cat.name }),
          el("span", { class: "cat-legend-pct", text: formatPct(w, 0) }),
        ]),
      );
    }

    returnReadout.textContent = weights.length ? formatPct(blendedReturn(a)) : "—";
    riskReadout.textContent = weights.length ? riskLabel(blendedVolatility(a)) : "—";

    for (const [id, slider] of rowSliders) {
      const raw = a[id] ?? 0;
      if (document.activeElement !== slider) slider.value = String(raw);
      const pct = rowPcts.get(id);
      if (pct) pct.textContent = `${Math.round(total > 0 ? (raw / total) * 100 : 0)}%`;
    }

    for (const [id, card] of libCards) {
      const added = id in a;
      card.classList.toggle("added", added);
      const glyph = card.querySelector(".asset-add");
      if (glyph) glyph.textContent = added ? "✓" : "+";
    }

    for (const { key, btn } of modelButtons) btn.classList.toggle("active", g?.activeProfile === key);
  }

  function onState(): void {
    const g = currentGoal();
    const key = (g?.id ?? "") + "|" + Object.keys(g?.allocation ?? {}).sort().join(",");
    if (key !== lastKey) {
      lastKey = key;
      rebuildList();
    }
    updateVisuals();
  }

  onState();
  subscribe(onState);
}
