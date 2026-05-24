import { auraGreeting, auraReply } from "../../lib/chat.js";
import { computePlan } from "../../lib/finance.js";
import { suggestedSip } from "../../lib/profile.js";
import { clear, el } from "../dom.js";
import { addChat, currentGoal, getState, planInputsForGoal, subscribe, toPlanInputs } from "../state.js";
function buildContext() {
    const s = getState();
    const inputs = toPlanInputs(s);
    const result = computePlan(inputs);
    const allGoals = s.goals.map((g) => {
        const r = computePlan(planInputsForGoal(s, g));
        return { name: g.name, emoji: g.emoji, progress: r.progress, onTrack: r.onTrack };
    });
    return { goalName: currentGoal(s)?.name ?? "your goal", result, inputs, allGoals, suggestedSip: suggestedSip(s.profile) };
}
export function mountChatPanel(root) {
    clear(root);
    let quickReplies = [];
    const messages = el("div", { class: "chat-messages" });
    const quickRow = el("div", { class: "chat-quick" });
    const input = el("input", { class: "chat-input", type: "text", placeholder: "Ask AURA anything…", "aria-label": "Message AURA" });
    const sendBtn = el("button", { class: "chat-send", type: "button", "aria-label": "Send", text: "→" });
    const header = el("div", { class: "chat-head" }, [
        el("div", { class: "chat-avatar", text: "◆" }),
        el("div", { class: "chat-id" }, [
            el("span", { class: "chat-name", text: "AURA" }),
            el("span", { class: "chat-status", text: "your finance match-maker" }),
        ]),
        el("span", { class: "pill pill-ai", text: "AI" }),
    ]);
    function send(text) {
        const t = text.trim();
        if (!t)
            return;
        addChat("user", t);
        const reply = auraReply(t, buildContext());
        quickReplies = reply.quickReplies;
        addChat("aura", reply.text);
    }
    sendBtn.addEventListener("click", () => {
        send(input.value);
        input.value = "";
        input.focus();
    });
    input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
            send(input.value);
            input.value = "";
        }
    });
    root.append(header, messages, quickRow, el("div", { class: "chat-inputrow" }, [input, sendBtn]));
    // Seed greeting if this is a fresh conversation.
    if (getState().chat.length === 0) {
        const g = auraGreeting(buildContext());
        quickReplies = g.quickReplies;
        addChat("aura", g.text);
    }
    let lastLen = -1;
    function render() {
        const chat = getState().chat;
        if (chat.length === lastLen)
            return;
        lastLen = chat.length;
        clear(messages);
        for (const m of chat) {
            messages.append(el("div", { class: "chat-msg chat-" + m.role }, [el("span", { class: "chat-bubble", text: m.text })]));
        }
        messages.scrollTop = messages.scrollHeight;
        clear(quickRow);
        for (const q of quickReplies) {
            const chip = el("button", { class: "chat-quick-chip", type: "button", text: q });
            chip.addEventListener("click", () => send(q));
            quickRow.append(chip);
        }
    }
    render();
    subscribe(render);
}
//# sourceMappingURL=chatPanel.js.map