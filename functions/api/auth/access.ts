// Sign-in via Iterverse's platform auth (Cloudflare Access, One-Time PIN)
// instead of Google/Microsoft OAuth -- see platform-auth/README.md in the
// ad_labs repo for the identity model and why this exists: no external
// OAuth app registration needed, and it's the same Access Application
// already used for the labs app's own enrollment, not a separate setup.
//
// Unlike the OAuth routes, there's no separate "initiate" step here --
// this whole path is expected to sit behind a Cloudflare Access
// Application, so hitting it at all is what makes Access run its OTP
// challenge *before* the request ever reaches this Function. By the time
// we see the request, Access has already authenticated the visitor and
// attached the signed assertion; this just verifies that assertion
// properly rather than trusting the plain `Cf-Access-Authenticated-User-
// Email` header (see access.ts's own top comment for why that matters).
//
// Revocation note: session.ts's comment on SESSION_TTL_SECONDS explains
// that Google/Microsoft sessions self-revoke because a deactivated school
// account can't complete OAuth again -- that property does NOT carry over
// to Access OTP automatically. OTP alone just proves someone controls a
// given email address; whether that address should still have access is
// entirely down to the Access Application's own policy configuration
// (e.g. restricting to a domain or an explicit roster), which needs to be
// kept current independently. See unified-access-vision.md in ad_labs for
// the still-open platform-wide revocation question.
import { verifyAccessJwt } from "../../lib/access";
import { appBaseUrl, createSession, setCookieHeader, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../../lib/session";
import { upsertUser } from "../../lib/users";

// checkRosterEntitlement's own header comment explains why this call sits
// here rather than in a shared _middleware.ts - it needs the verified
// email, which only exists after verifyAccessJwt succeeds.
async function checkRosterEntitlement(env: Env, email: string): Promise<boolean> {
  const response = await fetch(`${env.ROSTER_API_URL}/api/entitlement/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ROSTER_SERVICE_KEY}`,
    },
    body: JSON.stringify({ email, product: "reader" }),
  });
  if (!response.ok) return false;
  const data = await response.json<{ entitled?: boolean }>().catch(() => ({ entitled: false }));
  return data.entitled === true;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const base = appBaseUrl(ctx.request, ctx.env);

  const jwt = ctx.request.headers.get("Cf-Access-Jwt-Assertion");
  const email = jwt ? await verifyAccessJwt(jwt, ctx.env.ACCESS_TEAM_DOMAIN, ctx.env.ACCESS_AUD) : null;
  if (!email) {
    return new Response("Sign-in required.", { status: 403 });
  }
  // Deliberately no ALLOWED_EMAIL_DOMAIN check here, unlike the Google/
  // Microsoft callbacks - this is platform auth for whoever OTP verified,
  // not a school-tenant login. Students don't have @btech.edu accounts
  // yet, which is exactly why labs' own enroll.ts (this route's model)
  // never restricted by domain either: OTP proving control of *an* email
  // address is the entire point, not which domain it's on.

  // Reader's entitlement rule, per ad_labs/docs/unified-identity-v2-draft.md's
  // resolution: implied by any active enrollment in any course, anywhere -
  // not a per-course grant like Simulations/CLI/Packets/Scripts. Rejecting
  // here, before upsertUser/createSession, mirrors the same "reject before
  // creating a session" seam the Google/Microsoft callbacks already use for
  // their own domain check (isAllowedEmail).
  const entitled = await checkRosterEntitlement(ctx.env, email);
  if (!entitled) {
    return new Response(null, { status: 302, headers: { Location: `${base}/#/no-access` } });
  }

  const user = await upsertUser(ctx.env.DB, {
    email,
    name: null,
    provider: "access",
    sub: email,
  });

  const sessionId = await createSession(ctx.env, {
    userId: user.id,
    email,
    name: null,
    role: user.role,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${base}/#/manager/home`,
      "Set-Cookie": setCookieHeader(SESSION_COOKIE, sessionId, {
        maxAge: SESSION_TTL_SECONDS,
      }),
    },
  });
};
