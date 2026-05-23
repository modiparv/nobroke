import type { Insight } from "../../types.js";
import { clear, el } from "../dom.js";

export function renderCopilot(container: HTMLElement, insights: Insight[]): void {
  clear(container);

  const header = el("div", { class: "copilot-head" }, [
    el("div", { class: "copilot-avatar", text: "◆" }),
    el("div", { class: "copilot-id" }, [
      el("span", { class: "copilot-name", text: "NoBroke Copilot" }),
      el("span", { class: "copilot-status", text: "Watching your plan in real time" }),
    ]),
    el("span", { class: "pill pill-ai", text: "AI" }),
  ]);

  const list = el("div", { class: "insight-list" });
  for (const ins of insights) {
    list.append(
      el("div", { class: "insight insight-" + ins.tone }, [
        el("span", { class: "insight-icon", text: ins.icon }),
        el("div", { class: "insight-body" }, [
          el("span", { class: "insight-title", text: ins.title }),
          el("span", { class: "insight-msg", text: ins.message }),
        ]),
      ]),
    );
  }

  container.append(header, list);
}
