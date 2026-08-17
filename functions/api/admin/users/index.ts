import { requireAdmin } from "../../../lib/auth";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: "student" | "admin";
  created_at: string;
  last_login_at: string | null;
}

// Admin-only: list every account that has ever signed in, for the admin UI's
// role-management screen. Replaces the wrangler d1 execute one-liner from
// CLOUDFLARE.md with something clickable.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (!auth.ok) return auth.response;

  const { results } = await ctx.env.DB.prepare(
    `SELECT id, email, name, role, created_at, last_login_at FROM users ORDER BY created_at DESC`
  ).all<UserRow>();

  return Response.json({
    users: results.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
    })),
  });
};
