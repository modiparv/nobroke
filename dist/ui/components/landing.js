import { clear, el } from "../dom.js";
import { startDemo, startOnboarding } from "../state.js";
function navBar() {
    return el("header", { class: "nav" }, [
        el("div", { class: "nav-brand" }, [
            el("span", { class: "logo-mark", text: "◆" }),
            el("span", { class: "logo-word", text: "NoBroke" }),
        ]),
        el("nav", { class: "nav-links" }, [
            el("a", { class: "nav-link", href: "#how", text: "How it works" }),
            (() => {
                const b = el("button", { class: "btn-ghost", type: "button", text: "Explore demo" });
                b.addEventListener("click", startDemo);
                return b;
            })(),
            (() => {
                const b = el("button", { class: "btn-primary", type: "button", text: "Find your match" });
                b.addEventListener("click", startOnboarding);
                return b;
            })(),
        ]),
    ]);
}
function step(n, title, body) {
    return el("div", { class: "how-step" }, [
        el("span", { class: "how-num", text: n }),
        el("h3", { class: "how-title", text: title }),
        el("p", { class: "how-body", text: body }),
    ]);
}
function feature(icon, title, body) {
    return el("div", { class: "feature" }, [
        el("span", { class: "feature-icon", text: icon }),
        el("h3", { class: "feature-title", text: title }),
        el("p", { class: "feature-body", text: body }),
    ]);
}
export function mountLanding(root) {
    clear(root);
    const ctaPrimary = el("button", { class: "btn-primary btn-lg", type: "button", text: "Find your match →" });
    ctaPrimary.addEventListener("click", startOnboarding);
    const ctaSecondary = el("button", { class: "btn-ghost btn-lg", type: "button", text: "Explore the demo" });
    ctaSecondary.addEventListener("click", startDemo);
    const hero = el("section", { class: "hero" }, [
        el("span", { class: "hero-eyebrow", text: "The dating agent for your money" }),
        el("h1", { class: "hero-title", text: "Meet the goals you'll fall for." }),
        el("p", { class: "hero-lede", text: "NoBroke gets to know you with a few honest questions — then matches you to a plan and a portfolio you'll actually stick with. No jargon, no forms, no judgement." }),
        el("div", { class: "hero-cta" }, [ctaPrimary, ctaSecondary]),
        el("p", { class: "hero-microcopy", text: "Built for Gen-Z & millennials · 2-minute setup · cancel anytime" }),
    ]);
    const how = el("section", { class: "how", id: "how" }, [
        el("h2", { class: "section-title center", text: "It works like a great first date" }),
        el("div", { class: "how-grid" }, [
            step("01", "We get to know you", "A handful of fun questions about your dreams and lifestyle. We never lead with “what's your salary.”"),
            step("02", "AURA finds your match", "Our engine turns your answers into a goal plan and a portfolio tuned to your timeline and risk."),
            step("03", "You stay in control", "Drag-and-drop your portfolio, track every goal, and ask AURA anything — anytime."),
        ]),
    ]);
    const features = el("section", { class: "features" }, [
        el("div", { class: "feature-grid" }, [
            feature("🎛️", "Drag-and-drop balancer", "Build your mix across equity, mutual funds, bonds, debt & commodities — watch returns update live."),
            feature("💬", "AURA copilot", "A chat that tells you exactly where you stand and how to get to your goals faster."),
            feature("🎯", "Goal tracking", "Every dream — car, home, freedom — gets its own plan, corpus target and timeline."),
            feature("🔗", "Auto-import", "Connect your accounts and pull in existing investments in one tap. (Coming soon.)"),
        ]),
    ]);
    const finalCta = el("section", { class: "final-cta" }, [
        el("h2", { class: "final-cta-title", text: "Your money deserves a great match." }),
        (() => {
            const b = el("button", { class: "btn-primary btn-lg invert", type: "button", text: "Start now →" });
            b.addEventListener("click", startOnboarding);
            return b;
        })(),
    ]);
    const footer = el("footer", { class: "footer" }, [
        el("p", { class: "disclaimer", text: "NoBroke is an early prototype. Projections are illustrative, use simplified assumptions, and are not investment advice." }),
    ]);
    root.append(navBar(), el("main", { class: "main" }, [hero, how, features, finalCta]), footer);
}
//# sourceMappingURL=landing.js.map