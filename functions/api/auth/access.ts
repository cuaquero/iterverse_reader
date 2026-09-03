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
import { isAllowedEmail } from "../../lib/oauth";
import { appBaseUrl, createSession, setCookieHeader, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../../lib/session";
import { upsertUser } from "../../lib/users";

// Not secret - see ad_labs's admin.ts/enroll.ts for the identical comment
// on why: a team domain and an audience tag are just identifiers, visible
// in the Zero Trust dashboard and every Access redirect URL. Team domain
// is account-wide, shared with every other Iterverse service. This AUD is
// specific to whichever Access Application protects this route - get it
// from that Application's Overview tab in the Zero Trust dashboard.
const ACCESS_TEAM_DOMAIN = "dawn-mountain-9c54.cloudflareaccess.com";
const ACCESS_AUD = "<fill in from the Access Application protecting this route>";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const base = appBaseUrl(ctx.request, ctx.env);

  const jwt = ctx.request.headers.get("Cf-Access-Jwt-Assertion");
  const email = jwt ? await verifyAccessJwt(jwt, ACCESS_TEAM_DOMAIN, ACCESS_AUD) : null;
  if (!email) {
    return new Response("Sign-in required.", { status: 403 });
  }
  if (!isAllowedEmail(email, ctx.env.ALLOWED_EMAIL_DOMAIN)) {
    return new Response(`Access is limited to @${ctx.env.ALLOWED_EMAIL_DOMAIN} accounts. Signed in as ${email}.`, {
      status: 403,
    });
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
      Location: `${base}/manager/home`,
      "Set-Cookie": setCookieHeader(SESSION_COOKIE, sessionId, {
        maxAge: SESSION_TTL_SECONDS,
      }),
    },
  });
};
