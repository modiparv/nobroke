import { useEffect } from "react";
import { actions, getState, useStore } from "./store";
import { fetchMacro } from "./lib/macroApi";
import { me } from "./lib/authApi";
import { initTheme } from "./lib/theme";
import Landing from "./components/Landing";
import Onboarding from "./components/Onboarding";
import Plan from "./components/Plan";
import CopilotBar from "./components/CopilotBar";

export default function App() {
  const s = useStore();

  // Theme follows the person's preference (System by default), not the
  // screen. The boot script stamped it before paint; this keeps it live,
  // including OS scheme changes while on System.
  useEffect(() => {
    initTheme();
  }, []);

  // Live CPI becomes the planning inflation default (never overriding a
  // hand-set rate). One fetch per session, silent on failure.
  useEffect(() => {
    void fetchMacro().then((m) => {
      const cpi = m?.indicators.find((i) => i.key === "cpi_inflation");
      if (cpi) actions.applyMacroInflation(cpi.value);
    });
  }, []);

  // A surviving session signs the person back in and pulls their plan; a
  // truly dead one (401) drops the stale identity. A network or server
  // failure is neither: the identity stays, and online/focus signals retry
  // the reconciliation until it lands.
  useEffect(() => {
    void me().then((probe) => {
      if (probe.status === "ok") void actions.completeAuth(probe.user);
      else if (probe.status === "unauthed" && getState().user) actions.clearStaleUser();
    });
    const heal = () => void actions.revalidateSession();
    window.addEventListener("online", heal);
    window.addEventListener("focus", heal);
    return () => {
      window.removeEventListener("online", heal);
      window.removeEventListener("focus", heal);
    };
  }, []);

  // Best-effort save when the tab goes away, so the last edit is not lost.
  useEffect(() => {
    const flush = () => actions.flushNow();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  // Every screen change starts at the top: landing to intake to plan should
  // never inherit a scroll position from the page before it.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [s.screen]);

  return (
    <>
      {s.screen === "landing" && <Landing />}
      {s.screen === "onboarding" && <Onboarding />}
      {s.screen === "plan" && <Plan />}
      {/* The copilot steps aside while an overlay is open so it cannot paint
          or capture clicks over the modal (it lives outside the header's
          stacking context). */}
      {s.screen === "plan" && !s.modalOpen && <CopilotBar />}
    </>
  );
}
