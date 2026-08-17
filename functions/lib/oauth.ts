import { OAUTH_STATE_COOKIE, readCookie, setCookieHeader } from "./session";

// Minimal base64url JWT payload decode — no signature verification needed here,
// because the id_token is only ever read from a direct server-to-server HTTPS
// response from Google/Microsoft's OWN token endpoint (authenticated with our
// client secret), never from anything the browser/client supplied.
export function decodeJwtPayload(idToken: string): Record<string, any> {
  const payload = idToken.split(".")[1];
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const json = atob(padded);
  return JSON.parse(json);
}

export function newOAuthState(): string {
  return crypto.randomUUID();
}

export function oauthStateCookieHeader(state: string): string {
  return setCookieHeader(OAUTH_STATE_COOKIE, state, { maxAge: 600 }); // 10 minutes to complete login
}

export function verifyOAuthState(request: Request, returnedState: string | null): boolean {
  const expected = readCookie(request, OAUTH_STATE_COOKIE);
  return !!expected && !!returnedState && expected === returnedState;
}

export function isAllowedEmail(email: string | undefined, allowedDomain: string): email is string {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`);
}
