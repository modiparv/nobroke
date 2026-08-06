/** Client for the user module. Every call degrades to a quiet null/false so
 *  the app keeps working offline or before accounts are provisioned. */

export interface AuthUser {
  id: string;
  email: string;
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

export async function loadPlan(): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch("/api/plan");
    if (!r.ok) return null;
    const body = (await r.json()) as { ok: boolean; state?: Record<string, unknown> | null };
    return body.ok ? (body.state ?? null) : null;
  } catch {
    return null;
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
