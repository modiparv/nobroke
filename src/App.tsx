import { useStore } from "./store";
import Landing from "./components/Landing";
import Onboarding from "./components/Onboarding";
import Plan from "./components/Plan";
import CopilotBar from "./components/CopilotBar";

export default function App() {
  const s = useStore();
  return (
    <>
      {s.screen === "landing" && <Landing />}
      {s.screen === "onboarding" && <Onboarding />}
      {s.screen === "plan" && <Plan />}
      {s.screen === "plan" && <CopilotBar />}
    </>
  );
}
