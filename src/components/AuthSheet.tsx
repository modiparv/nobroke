import { useState } from "react";
import { credentialError, login, register, type AuthUser } from "../lib/authApi";
import { actions, getState } from "../store";
import { btnPrimary } from "../ui";
import PasswordField from "./PasswordField";

/**
 * Sign in / create account, as one small sheet. Password reset is manual
 * during early access (there is no email pipeline yet), and the copy says
 * so instead of pretending. onAuthed fires after the plan has been
 * reconciled, so the caller can navigate to the right screen.
 */
export default function AuthSheet({
  onClose,
  onAuthed,
  initialMode = "register",
}: {
  onClose: () => void;
  onAuthed?: (user: AuthUser) => void;
  initialMode?: "login" | "register";
}) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    // Instant client-side checks first: no network round trip for a blank or
    // malformed field.
    const invalid = credentialError(email, password, mode === "register");
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    // A retry after "signed in but plan not loaded" skips the credential round
    // trip: the session already exists (re-registering would even be rejected).
    const existing = getState().user;
    const r =
      existing && existing.email.toLowerCase() === email.trim().toLowerCase()
        ? { ok: true as const, user: existing }
        : mode === "register"
          ? await register(email, password)
          : await login(email, password);
    if (!r.ok || !r.user) {
      setBusy(false);
      setError(r.error ?? "Something went wrong. Try again.");
      return;
    }
    // Signing in wants the account's plan; registering seeds the new account.
    // If the plan cannot be read, say so and stay open — closing here would
    // silently show the wrong plan under the account's name.
    const synced = await actions.completeAuth(r.user, { preferServer: mode === "login" });
    if (synced !== "ok") {
      setBusy(false);
      setError("You're signed in, but your saved plan couldn't be loaded. Check your connection and try again.");
      return;
    }
    onAuthed?.(r.user);
    onClose();
  };

  // 56px fields with the format hint living in the placeholder, and the
  // primary button disabled until the group validates: the affordance is
  // "not yet", never an error after the fact.
  const field =
    "h-14 w-full rounded-control border border-line bg-surface px-4 text-base outline-none transition focus:border-accent";
  const invalid = credentialError(email, password, mode === "register") != null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-band/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-card border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-section font-medium text-display">{mode === "register" ? "Create your account" : "Welcome back"}</h2>
            <p className="mt-0.5 text-caption text-text-2">Your plan follows you to any device.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="px-1 text-text-2 transition hover:text-text">
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
            placeholder="name@email.com"
            aria-label="Email"
            className={field}
          />
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            placeholder={mode === "register" ? "Password (8+ characters)" : "Password"}
            className={field}
          />
          {error && (
            <p role="alert" aria-live="polite" className="rounded-control bg-neg-bg px-3 py-2 text-support text-neg">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || invalid} className={`${btnPrimary} w-full`}>
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
          {mode === "login" && <span className="text-caption text-text-2">Forgot it? Message us.</span>}
        </div>
      </div>
    </div>
  );
}
