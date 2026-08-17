import { consumeLtiHandoff } from "../../lib/lti";

// Exchanges a one-time LTI handoff code (see functions/api/lti/launch.ts) for
// the session id itself, called by the /lti/bridge page. Takes the code in
// the POST body rather than a query param so it doesn't linger in server logs.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = (await ctx.request.json().catch(() => null)) as { code?: string } | null;
  if (!body?.code) {
    return new Response(JSON.stringify({ error: "Missing code" }), { status: 400 });
  }

  const sessionId = await consumeLtiHandoff(ctx.env, body.code);
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Code is invalid or expired" }), {
      status: 400,
    });
  }

  return new Response(JSON.stringify({ sessionId }), {
    headers: { "Content-Type": "application/json" },
  });
};
