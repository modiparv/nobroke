/** Client for the user module. Every call degrades to a quiet null/false so
 *  the app keeps working offline or before accounts are provisioned. */

export interface AuthUser {
  id: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Instant, specific validation for the sign-in / sign-up forms, so every bad
 * input gets a clear message before any network call. Register enforces the
 * 8-character minimum; login only needs a non-empty password (existing
 * accounts already meet the rule).
 */
export function credentialError(email: string, password: string, isRegister: boolean): string | null {
  const e = email.trim();
  if (!e) return "Enter your email address.";
  if (!EMAIL_RE.test(e)) return "That email does not look right. Check the format.";
  if (!password) return isRegister ? "Create a password." : "Enter your password.";
  if (isRegister && password.length < 8) return "Password needs at least 8 characters.";
  return null;
}

interface AuthResponse {
  ok: boolean;
  user?: AuthUser;
  error?: string;
}

async function post(path: string, body?: unknown): Promise<AuthResponse> {
  try {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return (await r.json()) as AuthResponse;
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}

export function register(email: string, password: string): Promise<AuthResponse> {
  return post("/api/auth/register", { email, password });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return post("/api/auth/login", { email, password });
}

export function logout(): Promise<AuthResponse> {
  return post("/api/auth/logout");
}

export function deleteAccount(): Promise<AuthResponse> {
  return post("/api/auth/delete");
}

export async function me(): Promise<AuthUser | null> {
  try {
    const r = await fetch("/api/auth/me");
    if (!r.ok) return null;
    const body = (await r.json()) as { ok: boolean; user?: AuthUser | null };
    return body.ok && body.user ? body.user : null;
  } catch {
    return null;
  }
}

/**
 * Loading the account plan has three outcomes the caller must tell apart, so
 * a transient failure is never mistaken for "the account has no plan":
 *   ok     the server returned a stored plan
 *   empty  the account exists but has no plan yet
 *   error  network or server failure; state unknown
 */
export type PlanLoad =
  | { status: "ok"; state: Record<string, unknown> }
  | { status: "empty" }
  | { status: "error" };

export async function loadPlan(): Promise<PlanLoad> {
  try {
    const r = await fetch("/api/plan");
    if (!r.ok) return { status: "error" };
    const body = (await r.json()) as { ok: boolean; state?: Record<string, unknown> | null };
    if (!body.ok) return { status: "error" };
    return body.state ? { status: "ok", state: body.state } : { status: "empty" };
  } catch {
    return { status: "error" };
  }
}

export async function savePlan(state: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
  } catch {
    // Offline: localStorage still has it; the next change retries.
  }
}

/** A save that survives the page unloading (pagehide/tab close). */
export function savePlanBeacon(state: Record<string, unknown>): void {
  try {
    void fetch("/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
      keepalive: true,
    });
  } catch {
    // Nothing more to do as the page goes away.
  }
}
