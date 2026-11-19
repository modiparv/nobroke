import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { credentialError, inviteCodeError, login, register, type AuthUser } from "../lib/authApi";
import { actions, getState } from "../store";
import { btnPrimary } from "../ui";
import PasswordField from "./PasswordField";
import { StatusIcon } from "./StatusPill";

/**
 * The typed fields of signing in or creating an account: email, password
 * and, for a new account, the invite code. Used by the sheet below and by
 * the intake's last step, so both ask in the same words.
 *
 * What a field expects sits beside its label, where it stays readable while
 * typing. Every field is 16px text, so an iPhone does not zoom the page.
 */
const FIELD_SHAPE = {
  /** In a sheet: 48px, the same field the other sheets use. */
  sheet: "h-12 rounded-control px-3",
  /** In the intake: 56px, the height of its Continue button. */
  intake: "h-14 rounded-2xl px-4",
} as const;

const fieldBase =
  "w-full border border-line-2 bg-surface text-body text-text outline-none transition-colors focus:border-text focus:ring-1 focus:ring-text";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-support font-medium text-text">
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="text-right text-support text-text-2">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function CredentialFields({
  idPrefix,
  mode,
  size,
  email,
  password,
  invite,
  onEmail,
  onPassword,
  onInvite,
  error,
  emailRef,
}: {
  /** "as" in the sheet, "ob" in the intake: the field ids are as-email, ob-email and so on. */
  idPrefix: string;
  mode: "login" | "register";
  size: keyof typeof FIELD_SHAPE;
  email: string;
  password: string;
  invite: string;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onInvite: (v: string) => void;
  error: string | null;
  emailRef?: React.Ref<HTMLInputElement>;
}) {
  const field = `${fieldBase} ${FIELD_SHAPE[size]}`;
  const isNew = mode === "register";
  return (
    <>
      <Field id={`${idPrefix}-email`} label="Email">
        <input
          ref={emailRef}
          id={`${idPrefix}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          className={field}
        />
      </Field>
      <Field id={`${idPrefix}-password`} label="Password" hint={isNew ? "8 or more characters" : undefined}>
        <PasswordField
          id={`${idPrefix}-password`}
          value={password}
          onChange={onPassword}
          autoComplete={isNew ? "new-password" : "current-password"}
          describedBy={isNew ? `${idPrefix}-password-hint` : undefined}
          className={field}
        />
      </Field>
      {isNew && (
        <Field id={`${idPrefix}-invite`} label="Invite code" hint="By invitation for now">
          <input
            id={`${idPrefix}-invite`}
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={invite}
            onChange={(e) => onInvite(e.target.value)}
            aria-describedby={`${idPrefix}-invite-hint`}
            className={field}
          />
        </Field>
      )}
      {/* Red, an alert mark and the words: never colour alone. */}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-neg-bg px-3 py-2.5 text-left text-support text-neg">
          <StatusIcon level="far_short" size={16} className="mt-0.5" />
          <span>{error}</span>
        </p>
      )}
    </>
  );
}

/**
 * The part of the screen a person can actually see. On a phone the keyboard
 * covers the lower half without resizing the page, so a sheet sized to the
 * page would sit under it. The visual viewport is what is left above the
 * keyboard, and the sheet is laid out inside that.
 */
function useVisibleArea(): { top: number; height: number } | null {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const read = () => setArea({ top: vv.offsetTop, height: vv.height });
    read();
    vv.addEventListener("resize", read);
    vv.addEventListener("scroll", read);
    return () => {
      vv.removeEventListener("resize", read);
      vv.removeEventListener("scroll", read);
    };
  }, []);
  return area;
}

/**
 * Sign in or create an account, as one small sheet: from the bottom of a
 * phone, centred on a wider screen. It never grows past the visible screen.
 * With the keyboard open it scrolls inside itself, and its one button stays
 * in view. There is no password reset yet, so the sheet does not mention one.
 * onAuthed fires after the plan has been reconciled, so the caller can
 * navigate to the right screen.
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
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const area = useVisibleArea();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const emailField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keyboard focus starts inside the sheet and goes back to where it was.
  // With a mouse or trackpad it starts in the email field. On a touch screen
  // that would throw the keyboard up before the sheet has been seen, so
  // there the sheet itself takes focus.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = window.matchMedia("(pointer: fine)").matches ? emailField.current : panel.current;
    first?.focus({ preventScroll: true });
    return () => before?.focus({ preventScroll: true });
  }, []);

  const submit = async () => {
    if (busy) return;
    // Instant client-side checks first: no network round trip for a blank or
    // malformed field.
    const invalid = credentialError(email, password, mode === "register") ?? (mode === "register" ? inviteCodeError(invite) : null);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    // A retry after "signed in but plan not loaded" skips the credential round
    // trip: the session already exists (re-registering would even be rejected).
    const existing = getState().user;
    let r =
      existing && existing.email.toLowerCase() === email.trim().toLowerCase()
        ? { ok: true as const, user: existing }
        : mode === "register"
          ? await register(email, password, invite)
          : await login(email, password);
    // A returning user often types correct credentials into the register
    // form. "Email already exists" with these credentials means they meant to
    // sign in - try that before showing anyone an error.
    let usedLogin = mode === "login";
    // The same goes for a refused invite code (403): someone who already has
    // an account needs no invitation.
    if (mode === "register" && !r.ok && (r.status === 409 || r.status === 403)) {
      const refused = r;
      const asLogin = await login(email, password);
      if (asLogin.ok && asLogin.user) {
        r = asLogin;
        usedLogin = true;
      } else {
        setBusy(false);
        setError(
          refused.status === 409
            ? "An account with this email already exists, but this password doesn't match it. Sign in with the password you created earlier."
            : (refused.error ?? "That invite code was not accepted."),
        );
        return;
      }
    }
    if (!r.ok || !r.user) {
      setBusy(false);
      setError(r.error ?? "Something went wrong. Try again.");
      return;
    }
    // Signing in wants the account's plan; registering seeds the new account.
    // If the plan cannot be read, say so and stay open — closing here would
    // silently show the wrong plan under the account's name.
    const synced = await actions.completeAuth(r.user, { preferServer: usedLogin });
    if (synced !== "ok") {
      setBusy(false);
      setError("You're signed in, but your saved plan couldn't be loaded. Check your connection and try again.");
      return;
    }
    onAuthed?.(r.user);
    onClose();
  };

  // The button stays disabled until the fields validate: the affordance is
  // "not yet", never an error after the fact.
  const invalid = credentialError(email, password, mode === "register") != null || (mode === "register" && inviteCodeError(invite) != null);
  const isNew = mode === "register";

  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] items-end justify-center sm:items-center sm:p-4"
      style={area ? { top: area.top, height: area.height } : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="fixed inset-0 bg-night/50" onClick={onClose} />
      {/* Opening is the answer to a tap, so the sheet eases in (and does not
          when motion is reduced). The whole sheet is the scroller: when the
          visible screen is shorter than the form, the fields scroll and the
          button holds to the bottom edge. */}
      <div
        ref={panel}
        tabIndex={-1}
        className="fade-up relative max-h-[calc(100%-0.5rem)] w-full scroll-pb-24 overflow-y-auto overscroll-contain rounded-t-screen border border-line bg-surface px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 outline-none focus-visible:outline-none sm:max-h-full sm:max-w-sm sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pt-2">
            <h2 id={titleId} className="text-headline font-medium text-text">
              {isNew ? "Create your account" : "Sign in"}
            </h2>
            <p className="mt-1 text-support text-text-2">
              {isNew ? "Save your plan and open it on any device." : "Open the plan saved to your account."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2.5 grid h-11 w-11 flex-none place-items-center rounded-control text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <form
          className="mt-4 flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <CredentialFields
            idPrefix="as"
            mode={mode}
            size="sheet"
            email={email}
            password={password}
            invite={invite}
            onEmail={setEmail}
            onPassword={setPassword}
            onInvite={setInvite}
            error={error}
            emailRef={emailField}
          />
          <div className="sticky bottom-0 -mx-5 bg-surface px-5 pb-1 pt-1">
            <button type="submit" disabled={busy || invalid} className={`${btnPrimary} w-full`}>
              {busy ? "One moment…" : isNew ? "Create account" : "Sign in"}
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(isNew ? "login" : "register");
            setError(null);
          }}
          className="mx-auto flex min-h-11 items-center text-support font-medium text-text underline underline-offset-2 transition-colors hover:text-text-2"
        >
          {isNew ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
