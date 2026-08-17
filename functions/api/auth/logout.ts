import { clearCookieHeader, destroySession, SESSION_COOKIE } from "../../lib/session";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  await destroySession(ctx.request, ctx.env);
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearCookieHeader(SESSION_COOKIE) },
  });
};
