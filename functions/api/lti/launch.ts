import { appBaseUrl, createSession } from "../../lib/session";
import { isAllowedEmail } from "../../lib/oauth";
import {
  checkOrPinDeployment,
  consumeLtiLoginState,
  createLtiHandoff,
  getLtiPlatform,
  verifyLtiLaunch,
} from "../../lib/lti";
import { upsertUser } from "../../lib/users";
import { checkRosterEntitlement } from "../../lib/roster";

// Canvas form-posts the id_token here after its own auth endpoint completes.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const formData = await ctx.request.formData();
  const idToken = formData.get("id_token") as string | null;
  const state = formData.get("state") as string | null;
  const base = appBaseUrl(ctx.request, ctx.env);

  if (!idToken || !state) {
    return new Response("Launch is missing id_token or state.", { status: 400 });
  }

  const loginState = await consumeLtiLoginState(ctx.env, state);
  if (!loginState) {
    return new Response(
      "Launch failed: state is invalid or expired. Reload the page in Canvas and try again.",
      { status: 400 }
    );
  }

  const platform = await getLtiPlatform(ctx.env.DB, loginState.issuer, loginState.clientId);
  if (!platform) {
    return new Response("This Canvas instance isn't registered with this tool.", {
      status: 403,
    });
  }

  let claims;
  try {
    claims = await verifyLtiLaunch(ctx.env, idToken, platform, loginState.nonce);
  } catch (err) {
    return new Response(`Launch failed: ${(err as Error).message}`, { status: 403 });
  }

  if (!isAllowedEmail(claims.email, ctx.env.ALLOWED_EMAIL_DOMAIN)) {
    return new Response(
      `Access is limited to @${ctx.env.ALLOWED_EMAIL_DOMAIN} accounts. Launched as ${claims.email}.`,
      { status: 403 }
    );
  }

  const deploymentOk = await checkOrPinDeployment(ctx.env.DB, platform, claims.deploymentId);
  if (!deploymentOk) {
    return new Response(
      "Launch failed: unexpected deployment for this platform registration.",
      { status: 403 }
    );
  }

  // Same roster check the Access OTP path requires - a @btech.edu account
  // alone isn't enough, it also needs an active course enrollment. See
  // ad_labs/docs/unified-identity-v2-draft.md's Reader resolution.
  const entitled = await checkRosterEntitlement(ctx.env, claims.email);
  if (!entitled) {
    return new Response(null, { status: 302, headers: { Location: `${base}/#/no-access` } });
  }

  // Every LTI launch lands as 'student' regardless of the Canvas role in the
  // claims -- 'admin' here means catalog-management, a deliberate promotion
  // via /admin, not something a Canvas course role should grant automatically.
  const user = await upsertUser(ctx.env.DB, {
    email: claims.email,
    name: claims.name,
    provider: "lti",
    sub: claims.sub,
  });

  const sessionId = await createSession(ctx.env, {
    userId: user.id,
    email: claims.email,
    name: claims.name,
    role: user.role,
  });

  // Canvas embeds the tool in an iframe, so a Set-Cookie here would be a
  // third-party cookie -- unreliable under Safari ITP and Chrome's
  // third-party-cookie phase-out even with SameSite=None. Hand the session off
  // via a one-time code in a URL fragment instead (never sent to the server or
  // logged) and let /lti/bridge exchange it client-side. See LTI.md.
  const handoffCode = await createLtiHandoff(ctx.env, sessionId);

  // The app uses HashRouter, so "/lti/bridge" only ever exists client-side --
  // the server sees a request for "/" no matter what follows the "#". The
  // `lti_launch` query param is what functions/_middleware.ts's under-
  // construction gate actually keys off of to let this one redirect through
  // without exposing the rest of the (still unfinished) app. See LTI.md.
  return new Response(null, {
    status: 302,
    headers: { Location: `${base}/?lti_launch=1#/lti/bridge?code=${handoffCode}` },
  });
};
