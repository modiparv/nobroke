import { useEffect } from "react";
import { actions, useStore } from "./store";
import { fetchMacro } from "./lib/macroApi";
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

  return (
    <>
      {s.screen === "landing" && <Landing />}
      {s.screen === "onboarding" && <Onboarding />}
      {s.screen === "plan" && <Plan />}
      {s.screen === "plan" && <CopilotBar />}
    </>
  );
}
