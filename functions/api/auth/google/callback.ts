import { appBaseUrl, createSession, setCookieHeader, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../../../lib/session";
import { decodeJwtPayload, isAllowedEmail, verifyOAuthState } from "../../../lib/oauth";
import { upsertUser } from "../../../lib/users";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const base = appBaseUrl(ctx.request, ctx.env);

  if (!verifyOAuthState(ctx.request, state)) {
    return new Response("Login failed: invalid or expired state. Please try signing in again.", { status: 400 });
  }
  if (!code) {
    return new Response("Login failed: Google did not return an authorization code.", { status: 400 });
  }
  if (!ctx.env.GOOGLE_CLIENT_ID || !ctx.env.GOOGLE_CLIENT_SECRET) {
    return new Response("Google sign-in isn't configured yet.", { status: 501 });
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ctx.env.GOOGLE_CLIENT_ID,
      client_secret: ctx.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${base}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return new Response(`Login failed: Google token exchange failed (${tokenRes.status}).`, { status: 502 });
  }

  const tokenData = (await tokenRes.json()) as { id_token?: string };
  if (!tokenData.id_token) {
    return new Response("Login failed: Google did not return an ID token.", { status: 502 });
  }

  const claims = decodeJwtPayload(tokenData.id_token);
  if (!isAllowedEmail(claims.email, ctx.env.ALLOWED_EMAIL_DOMAIN)) {
    return new Response(
      `Access is limited to @${ctx.env.ALLOWED_EMAIL_DOMAIN} accounts. Signed in as ${claims.email ?? "unknown"}.`,
      { status: 403 }
    );
  }
  if (claims.email_verified === false) {
    return new Response("Login failed: Google reports this email address is not verified.", { status: 403 });
  }

  const user = await upsertUser(ctx.env.DB, {
    email: claims.email,
    name: claims.name ?? null,
    provider: "google",
    sub: claims.sub,
  });

  const sessionId = await createSession(ctx.env, {
    userId: user.id,
    email: claims.email,
    name: claims.name ?? null,
    role: user.role,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${base}/manager/home`,
      "Set-Cookie": setCookieHeader(SESSION_COOKIE, sessionId, {
        maxAge: SESSION_TTL_SECONDS,
      }),
    },
  });
};
