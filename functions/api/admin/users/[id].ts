import { requireAdmin } from "../../../lib/auth";

const VALID_ROLES = new Set(["student", "admin"]);

// Admin-only: change one user's role. Self-demotion is blocked so an admin
// can't accidentally lock themselves out — there's no UI-based way back in,
// only the direct D1 update this endpoint was built to replace.
export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (!auth.ok) return auth.response;

  const id = ctx.params.id as string;
  let body: { role?: string };
  try {
    body = await ctx.request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const role = body.role;
  if (!role || !VALID_ROLES.has(role)) {
    return new Response(`"role" must be one of: ${[...VALID_ROLES].join(", ")}`, { status: 400 });
  }

  if (id === auth.user.userId && role !== "admin") {
    return new Response("Cannot change your own role", { status: 400 });
  }

  const existing = await ctx.env.DB.prepare("SELECT id FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!existing) return new Response("Not found", { status: 404 });

  await ctx.env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, id).run();

  return Response.json({ id, role });
};
