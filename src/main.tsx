import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * Last-resort error boundary: a rendering crash shows a calm recovery card
 * instead of a blank page. "Start fresh" clears saved state for the rare
 * case where corrupted local data is the crash itself.
 */
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("app crashed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Something went wrong on our side.</h1>
          <p style={{ marginTop: 8, fontSize: 14, opacity: 0.7 }}>
            Your plan is saved. Reload to pick up where you left off; if it happens again, start fresh.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}
            >
              Reload
            </button>
            <button
              onClick={() => {
                try {
                  localStorage.removeItem("nobroke_state_v1");
                } catch {
                  // Storage unavailable: reload alone is the best we can do.
                }
                window.location.reload();
              }}
              style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "currentColor", cursor: "pointer" }}
            >
              <span style={{ filter: "invert(1)" }}>Start fresh</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
);
