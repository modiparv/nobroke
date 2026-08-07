import { useEffect } from "react";
import { actions, getState, useStore } from "./store";
import { fetchMacro } from "./lib/macroApi";
import { me } from "./lib/authApi";
import Landing from "./components/Landing";
import Onboarding from "./components/Onboarding";
import Plan from "./components/Plan";
import CopilotBar from "./components/CopilotBar";

export default function App() {
  const s = useStore();

  // The marketing surface is dark and editorial; the working surfaces are
  // light and professional. One attribute flip, both palettes prebuilt.
  useEffect(() => {
    document.documentElement.dataset.theme = s.screen === "landing" ? "dark" : "light";
  }, [s.screen]);

  // Live CPI becomes the planning inflation default (never overriding a
  // hand-set rate). One fetch per session, silent on failure.
  useEffect(() => {
    void fetchMacro().then((m) => {
      const cpi = m?.indicators.find((i) => i.key === "cpi_inflation");
      if (cpi) actions.applyMacroInflation(cpi.value);
    });
  }, []);

  // A surviving session signs the person back in and pulls their plan; a dead
  // one drops the stale signed-in identity instead of pretending forever.
  useEffect(() => {
    void me().then((user) => {
      if (user) void actions.completeAuth(user);
      else if (getState().user) actions.clearStaleUser();
    });
  }, []);

  // Best-effort save when the tab goes away, so the last edit is not lost.
  useEffect(() => {
    const flush = () => actions.flushNow();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

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
