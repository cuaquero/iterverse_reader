import { appBaseUrl } from "../../lib/session";
import { newOAuthState, oauthStateCookieHeader } from "../../lib/oauth";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.GOOGLE_CLIENT_ID) {
    return new Response(
      "Google sign-in isn't configured yet (missing GOOGLE_CLIENT_ID).",
      { status: 501 }
    );
  }

  const state = newOAuthState();
  const redirectUri = `${appBaseUrl(ctx.request, ctx.env)}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", ctx.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  // Hints Google's account chooser toward the school domain; NOT a security
  // boundary on its own — the callback re-verifies the email domain itself.
  authUrl.searchParams.set("hd", ctx.env.ALLOWED_EMAIL_DOMAIN);
  authUrl.searchParams.set("prompt", "select_account");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      "Set-Cookie": oauthStateCookieHeader(state),
    },
  });
};
