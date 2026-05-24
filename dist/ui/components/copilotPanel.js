import { clear, el } from "../dom.js";
export function renderCopilot(container, insights) {
    clear(container);
    const header = el("div", { class: "copilot-head" }, [
        el("div", { class: "copilot-avatar", text: "◆" }),
        el("div", { class: "copilot-id" }, [
            el("span", { class: "copilot-name", text: "What AURA sees" }),
            el("span", { class: "copilot-status", text: "Updated live as you tweak" }),
        ]),
    ]);
    const list = el("div", { class: "insight-list" });
    for (const ins of insights) {
        list.append(el("div", { class: "insight insight-" + ins.tone }, [
            el("span", { class: "insight-icon", text: ins.icon }),
            el("div", { class: "insight-body" }, [
                el("span", { class: "insight-title", text: ins.title }),
                el("span", { class: "insight-msg", text: ins.message }),
            ]),
        ]));
    }
    container.append(header, list);
}
//# sourceMappingURL=copilotPanel.js.map