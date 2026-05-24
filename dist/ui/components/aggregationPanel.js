import { AGGREGATION_PROVIDERS } from "../../lib/aggregation.js";
import { clear, el } from "../dom.js";
export function mountAggregationPanel(root) {
    clear(root);
    const connected = new Set();
    const grid = el("div", { class: "agg-grid" });
    for (const p of AGGREGATION_PROVIDERS) {
        const status = el("span", { class: "agg-status", text: "Not connected" });
        const btn = el("button", { class: "btn-ghost agg-btn", type: "button", text: "Connect" });
        const card = el("div", { class: "agg-card" }, [
            el("div", { class: "agg-head" }, [
                el("span", { class: "agg-icon", text: p.icon }),
                el("div", { class: "agg-titles" }, [
                    el("span", { class: "agg-name", text: p.name }),
                    el("span", { class: "agg-providers", text: p.providers }),
                ]),
            ]),
            el("p", { class: "agg-desc", text: p.description }),
            el("div", { class: "agg-foot" }, [status, btn]),
        ]);
        btn.addEventListener("click", () => {
            if (connected.has(p.id))
                return;
            connected.add(p.id);
            card.classList.add("connected");
            status.textContent = "Synced · demo";
            btn.textContent = "Connected ✓";
            btn.disabled = true;
        });
        grid.append(card);
    }
    root.append(el("div", { class: "agg-intro" }, [
        el("span", { class: "agg-badge", text: "Coming soon" }),
        el("p", { class: "agg-lead", text: "Already invested? Connect your accounts and AURA pulls everything in automatically — no spreadsheets." }),
    ]), grid);
}
//# sourceMappingURL=aggregationPanel.js.map