import { ASSET_CLASSES, ASSET_MAP } from "../../lib/assets.js";
import { MODEL_PORTFOLIOS, autoAllocation } from "../../lib/portfolios.js";
import { allocationTotal, blendedReturn, blendedVolatility, normalizedWeights } from "../../lib/finance.js";
import { formatPct } from "../../lib/format.js";
import { clear, el } from "../dom.js";
import { getState, setState, subscribe } from "../state.js";
function riskLabel(vol) {
    if (vol < 0.04)
        return "Low";
    if (vol < 0.1)
        return "Moderate";
    if (vol < 0.16)
        return "High";
    return "Very High";
}
function addAsset(id) {
    const alloc = { ...getState().allocation };
    if (!(id in alloc)) {
        alloc[id] = 10;
        setState({ allocation: alloc, activeProfile: null });
    }
}
function removeAsset(id) {
    const alloc = { ...getState().allocation };
    delete alloc[id];
    setState({ allocation: alloc, activeProfile: null });
}
function setWeight(id, w) {
    const alloc = { ...getState().allocation };
    alloc[id] = w;
    setState({ allocation: alloc, activeProfile: null });
}
function balance() {
    const w = normalizedWeights(getState().allocation);
    if (!w.length)
        return;
    const alloc = {};
    let sum = 0;
    for (const { id, weight } of w) {
        alloc[id] = Math.round(weight * 100);
        sum += alloc[id];
    }
    const diff = 100 - sum;
    if (diff !== 0) {
        const max = [...w].sort((a, b) => b.weight - a.weight)[0];
        alloc[max.id] += diff;
    }
    setState({ allocation: alloc });
}
export function mountPortfolioBuilder(root) {
    clear(root);
    // --- Model portfolio buttons ---
    const modelRow = el("div", { class: "pb-models" });
    const modelButtons = [];
    ["conservative", "balanced", "aggressive"].forEach((key) => {
        const m = MODEL_PORTFOLIOS[key];
        const btn = el("button", { class: "model-btn", type: "button" }, [
            el("span", { class: "model-name", text: m.label }),
            el("span", { class: "model-tag", text: m.tagline }),
        ]);
        btn.addEventListener("click", () => setState({ allocation: { ...m.allocation }, activeProfile: key }));
        modelButtons.push({ key, btn });
        modelRow.append(btn);
    });
    const autoBtn = el("button", { class: "model-btn model-auto", type: "button" }, [
        el("span", { class: "model-name", text: "✨ Auto" }),
        el("span", { class: "model-tag", text: "AI-matched to horizon" }),
    ]);
    autoBtn.addEventListener("click", () => {
        const auto = autoAllocation(getState().horizonYears);
        setState({ allocation: { ...auto.allocation }, activeProfile: auto.profile });
    });
    modelRow.append(autoBtn);
    // --- Asset library ---
    const library = el("div", { class: "pb-library" });
    library.append(el("span", { class: "pb-section-label", text: "Asset library — drag a card into your portfolio" }));
    const libGrid = el("div", { class: "asset-grid" });
    const libCards = new Map();
    for (const a of ASSET_CLASSES) {
        const card = el("button", { class: "asset-card", type: "button", draggable: "true", "data-id": a.id, title: a.description }, [
            el("span", { class: "asset-dot", style: `background:${a.color}` }),
            el("div", { class: "asset-info" }, [
                el("span", { class: "asset-name", text: a.shortName }),
                el("span", { class: "asset-meta", text: `${formatPct(a.expectedReturn, 0)} p.a. • ${a.risk}` }),
            ]),
            el("span", { class: "asset-add", text: "+" }),
        ]);
        card.addEventListener("click", () => (a.id in getState().allocation ? removeAsset(a.id) : addAsset(a.id)));
        card.addEventListener("dragstart", (ev) => {
            ev.dataTransfer?.setData("text/plain", a.id);
            if (ev.dataTransfer)
                ev.dataTransfer.effectAllowed = "copy";
            card.classList.add("dragging");
        });
        card.addEventListener("dragend", () => card.classList.remove("dragging"));
        libCards.set(a.id, card);
        libGrid.append(card);
    }
    library.append(libGrid);
    // --- Portfolio (drop zone) ---
    const totalBadge = el("span", { class: "total-badge" });
    const portfolioHead = el("div", { class: "pb-portfolio-head" }, [
        el("span", { class: "pb-section-label", text: "Your portfolio" }),
        totalBadge,
    ]);
    const allocBar = el("div", { class: "alloc-bar" });
    const list = el("div", { class: "portfolio-list" });
    const returnReadout = el("span", { class: "readout-value" });
    const riskReadout = el("span", { class: "readout-value" });
    const balanceBtn = el("button", { class: "balance-btn", type: "button", text: "Balance to 100%" });
    balanceBtn.addEventListener("click", balance);
    const readout = el("div", { class: "pb-readout" }, [
        el("div", { class: "readout" }, [el("span", { class: "readout-label", text: "Expected return" }), returnReadout]),
        el("div", { class: "readout" }, [el("span", { class: "readout-label", text: "Risk" }), riskReadout]),
        balanceBtn,
    ]);
    const portfolio = el("div", { class: "pb-portfolio" }, [portfolioHead, allocBar, list, readout]);
    portfolio.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        if (ev.dataTransfer)
            ev.dataTransfer.dropEffect = "copy";
        portfolio.classList.add("drag-over");
    });
    portfolio.addEventListener("dragleave", (ev) => {
        if (!portfolio.contains(ev.relatedTarget))
            portfolio.classList.remove("drag-over");
    });
    portfolio.addEventListener("drop", (ev) => {
        ev.preventDefault();
        portfolio.classList.remove("drag-over");
        const id = ev.dataTransfer?.getData("text/plain");
        if (id && ASSET_MAP[id])
            addAsset(id);
    });
    const columns = el("div", { class: "pb-columns" }, [library, portfolio]);
    root.append(modelRow, columns);
    // --- Rendering ---
    const rowSliders = new Map();
    const rowPcts = new Map();
    let lastKeys = "";
    function rebuildList() {
        clear(list);
        rowSliders.clear();
        rowPcts.clear();
        const alloc = getState().allocation;
        const ids = Object.keys(alloc);
        if (!ids.length) {
            list.append(el("div", { class: "portfolio-empty", text: "Drag assets here, or pick a model portfolio above." }));
            portfolio.classList.add("empty");
            return;
        }
        portfolio.classList.remove("empty");
        for (const id of ids) {
            const a = ASSET_MAP[id];
            if (!a)
                continue;
            const slider = el("input", {
                class: "prow-slider",
                type: "range",
                min: "0",
                max: "100",
                step: "1",
                "aria-label": a.name + " weight",
            });
            slider.style.accentColor = a.color;
            slider.addEventListener("input", () => setWeight(id, parseFloat(slider.value)));
            const pct = el("span", { class: "prow-pct" });
            const remove = el("button", { class: "prow-remove", type: "button", title: "Remove", text: "×" });
            remove.addEventListener("click", () => removeAsset(id));
            list.append(el("div", { class: "prow", "data-id": id }, [
                el("span", { class: "asset-dot", style: `background:${a.color}` }),
                el("div", { class: "prow-info" }, [
                    el("span", { class: "prow-name", text: a.shortName }),
                    el("span", { class: "prow-meta", text: `${formatPct(a.expectedReturn, 0)} p.a.` }),
                ]),
                slider,
                pct,
                remove,
            ]));
            rowSliders.set(id, slider);
            rowPcts.set(id, pct);
        }
    }
    function updateVisuals() {
        const s = getState();
        const alloc = s.allocation;
        const total = allocationTotal(alloc);
        const weights = normalizedWeights(alloc);
        // Total badge
        const balanced = Math.abs(total - 100) < 0.5;
        totalBadge.textContent = balanced ? "100% ✓" : `${Math.round(total)}%`;
        totalBadge.className = "total-badge " + (balanced ? "ok" : "warn");
        balanceBtn.disabled = balanced || weights.length === 0;
        // Allocation bar
        clear(allocBar);
        if (!weights.length) {
            allocBar.append(el("div", { class: "alloc-empty" }));
        }
        else {
            for (const { id, weight } of weights) {
                const a = ASSET_MAP[id];
                const seg = el("div", { class: "alloc-seg", style: `width:${(weight * 100).toFixed(2)}%;background:${a?.color ?? "#999"}`, title: `${a?.shortName ?? id} ${(weight * 100).toFixed(0)}%` });
                allocBar.append(seg);
            }
        }
        // Readouts
        returnReadout.textContent = weights.length ? formatPct(blendedReturn(alloc)) : "—";
        const vol = blendedVolatility(alloc);
        riskReadout.textContent = weights.length ? riskLabel(vol) : "—";
        // Row sliders + percentages (skip the one being dragged)
        for (const [id, slider] of rowSliders) {
            const raw = alloc[id] ?? 0;
            if (document.activeElement !== slider)
                slider.value = String(raw);
            const normalized = total > 0 ? (raw / total) * 100 : 0;
            const pct = rowPcts.get(id);
            if (pct)
                pct.textContent = `${Math.round(normalized)}%`;
        }
        // Library "added" states
        for (const [id, card] of libCards) {
            const added = id in alloc;
            card.classList.toggle("added", added);
            const glyph = card.querySelector(".asset-add");
            if (glyph)
                glyph.textContent = added ? "✓" : "+";
        }
        // Model button highlight (Auto is a one-shot action, never "active")
        for (const { key, btn } of modelButtons)
            btn.classList.toggle("active", s.activeProfile === key);
    }
    function onState() {
        const keys = Object.keys(getState().allocation).sort().join(",");
        if (keys !== lastKeys) {
            lastKeys = keys;
            rebuildList();
        }
        updateVisuals();
    }
    onState();
    subscribe(onState);
}
//# sourceMappingURL=portfolioBuilder.js.map