import { getSessionUser } from "../../lib/session";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const user = await getSessionUser(ctx.request, ctx.env);
  if (!user) return new Response(JSON.stringify({ user: null }), { status: 401 });
  return Response.json({ user });
};
