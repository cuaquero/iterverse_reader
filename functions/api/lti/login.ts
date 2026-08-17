import { appBaseUrl } from "../../lib/session";
import {
  getLtiPlatform,
  newLtiNonce,
  newLtiState,
  storeLtiLoginState,
} from "../../lib/lti";

// Third-party-initiated OIDC login
// (https://www.imsglobal.org/spec/lti/v1p3/#additional-login-parameters).
// Canvas navigates its tool placement here first, with `iss`/`client_id`/
// `login_hint`/`target_link_uri` -- no id_token yet. We redirect to the
// platform's own auth endpoint with a fresh state+nonce; the actual launch
// arrives later at /api/lti/launch once Canvas's auth endpoint redirects back.
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const params: Record<string, string> =
    request.method === "POST"
      ? Object.fromEntries((await request.formData()) as any)
      : Object.fromEntries(url.searchParams as any);

  const iss = params.iss;
  const loginHint = params.login_hint;
  const targetLinkUri = params.target_link_uri;
  const clientId = params.client_id;

  if (!iss || !loginHint || !targetLinkUri) {
    return new Response("Missing required LTI login parameters.", { status: 400 });
  }

  const platform = await getLtiPlatform(env.DB, iss, clientId);
  if (!platform) {
    return new Response("This Canvas instance isn't registered with this tool.", {
      status: 403,
    });
  }

  const state = newLtiState();
  const nonce = newLtiNonce();
  await storeLtiLoginState(env, state, {
    nonce,
    issuer: platform.issuer,
    clientId: platform.clientId,
    targetLinkUri,
  });

  const authUrl = new URL(platform.authLoginUrl);
  authUrl.searchParams.set("scope", "openid");
  authUrl.searchParams.set("response_type", "id_token");
  authUrl.searchParams.set("client_id", platform.clientId);
  authUrl.searchParams.set(
    "redirect_uri",
    `${appBaseUrl(request, env)}/api/lti/launch`
  );
  authUrl.searchParams.set("login_hint", loginHint);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_mode", "form_post");
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "none");
  if (params.lti_message_hint) {
    authUrl.searchParams.set("lti_message_hint", params.lti_message_hint);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
}

export const onRequestGet: PagesFunction<Env> = (ctx) => handle(ctx.request, ctx.env);
export const onRequestPost: PagesFunction<Env> = (ctx) => handle(ctx.request, ctx.env);
