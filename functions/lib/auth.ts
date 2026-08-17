import { getSessionUser, SessionUser } from "./session";

// Two outcomes both matter here: "not logged in" (401) vs "logged in but not
// allowed" (403) are genuinely different states a client should handle
// differently, so these return a discriminated result rather than just null.
export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

export async function requireUser(request: Request, env: Env): Promise<AuthResult> {
  const user = await getSessionUser(request, env);
  if (!user) return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  return { ok: true, user };
}

export async function requireAdmin(request: Request, env: Env): Promise<AuthResult> {
  const result = await requireUser(request, env);
  if (!result.ok) return result;
  if (result.user.role !== "admin") {
    return { ok: false, response: new Response("Admin access required", { status: 403 }) };
  }
  return result;
}
