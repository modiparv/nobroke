import { useStore } from "./store";
import Landing from "./components/Landing";
import Onboarding from "./components/Onboarding";
import Goals from "./components/Goals";
import Dashboard from "./components/Dashboard";
import ChatDock from "./components/ChatPanel";

export default function App() {
  const s = useStore();
  return (
    <>
      {s.screen === "landing" && <Landing />}
      {s.screen === "onboarding" && <Onboarding />}
      {s.screen === "goals" && <Goals />}
      {s.screen === "dashboard" && <Dashboard />}
      <ChatDock />
    </>
  );
}
