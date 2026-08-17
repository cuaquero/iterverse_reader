import { appBaseUrl } from "../../lib/session";
import { newOAuthState, oauthStateCookieHeader } from "../../lib/oauth";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.MICROSOFT_CLIENT_ID) {
    return new Response(
      "Microsoft sign-in isn't configured yet (missing MICROSOFT_CLIENT_ID).",
      { status: 501 }
    );
  }

  const state = newOAuthState();
  const redirectUri = `${appBaseUrl(ctx.request, ctx.env)}/api/auth/microsoft/callback`;

  // "organizations" (not "common") restricts sign-in to work/school accounts,
  // excluding personal Microsoft accounts outright.
  const authUrl = new URL(
    "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize"
  );
  authUrl.searchParams.set("client_id", ctx.env.MICROSOFT_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      "Set-Cookie": oauthStateCookieHeader(state),
    },
  });
};
