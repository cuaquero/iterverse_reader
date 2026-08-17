// Session cookie + KV-backed session store shared by every authenticated route.
//
// Sessions are short-lived on purpose (see SESSION_TTL_SECONDS): this app has no
// standing "disable this account" mechanism of its own, so access-while-enrolled
// is enforced by forcing periodic re-auth against BTECH's own Google/Microsoft
// directory instead. A deactivated school account simply can't complete OAuth
// again once its session expires.

export const SESSION_COOKIE = "btech_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
export const OAUTH_STATE_COOKIE = "btech_oauth_state";

export interface SessionUser {
  userId: string;
  email: string;
  name: string | null;
  role: "student" | "admin";
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function setCookieHeader(
  name: string,
  value: string,
  opts: { maxAge?: number; path?: string } = {}
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path ?? "/"}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

export function clearCookieHeader(name: string, path = "/"): string {
  return `${name}=; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function createSession(
  env: Env,
  user: SessionUser
): Promise<string> {
  const sessionId = crypto.randomUUID();
  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(user), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return sessionId;
}

export async function getSessionUser(
  request: Request,
  env: Env
): Promise<SessionUser | null> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  const raw = await env.SESSIONS.get(`session:${sessionId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export async function destroySession(
  request: Request,
  env: Env
): Promise<void> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (sessionId) await env.SESSIONS.delete(`session:${sessionId}`);
}

export function appBaseUrl(request: Request, env: Env): string {
  return env.APP_BASE_URL || new URL(request.url).origin;
}
