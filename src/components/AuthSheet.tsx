import { useState } from "react";
import { login, register } from "../lib/authApi";
import { actions } from "../store";
import { btnPrimary } from "../ui";

/**
 * Sign in / create account, as one small sheet. Password reset is manual
 * during early access (there is no email pipeline yet), and the copy says
 * so instead of pretending.
 */
export default function AuthSheet({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = mode === "register" ? await register(email, password) : await login(email, password);
    setBusy(false);
    if (!r.ok || !r.user) {
      setError(r.error ?? "Something went wrong. Try again.");
      return;
    }
    void actions.completeAuth(r.user);
    onClose();
  };

  const field =
    "h-10 w-full rounded-control border border-line bg-surface px-3 text-sm outline-none transition focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-band/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-card border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-section font-medium">{mode === "register" ? "Create your account" : "Welcome back"}</h2>
            <p className="mt-0.5 text-caption text-text-3">Your plan follows you to any device.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="px-1 text-text-3 transition hover:text-text">
            ✕
          </button>
        </div>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            className={field}
          />
          <input
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "Password (8+ characters)" : "Password"}
            aria-label="Password"
            className={field}
          />
          {error && <p className="text-caption text-neg">{error}</p>}
          <button type="submit" disabled={busy || !email || !password} className={`${btnPrimary} w-full`}>
            {busy ? "One moment…" : mode === "register" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setError(null);
            }}
            className="text-caption text-accent transition hover:text-accent-hi"
          >
            {mode === "register" ? "Have an account? Sign in" : "New here? Create an account"}
          </button>
          {mode === "login" && <span className="text-caption text-text-3">Forgot it? Message us.</span>}
        </div>
      </div>
    </div>
  );
}
