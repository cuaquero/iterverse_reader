import { getSessionUser } from "../../lib/session";

// Mirrors DatabaseService's web-fallback contract exactly: each dbName
// ("book", "bookmark", "note", "highlight", etc.) is a JSON array of records,
// replaced wholesale on every write. See migrations/0001_init_schema.sql for
// why this shape was chosen over a normalized per-entity schema for the first
// cut.

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const user = await getSessionUser(ctx.request, ctx.env);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const dbName = ctx.params.dbName as string;
  const row = await ctx.env.DB.prepare(
    "SELECT data FROM kv_store WHERE user_id = ? AND db_name = ?"
  )
    .bind(user.userId, dbName)
    .first<{ data: string }>();

  return Response.json(row ? JSON.parse(row.data) : []);
};

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const user = await getSessionUser(ctx.request, ctx.env);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const dbName = ctx.params.dbName as string;
  let records: unknown;
  try {
    records = await ctx.request.json();
  } catch {
    return new Response("Request body must be a JSON array", { status: 400 });
  }
  if (!Array.isArray(records)) {
    return new Response("Request body must be a JSON array", { status: 400 });
  }

  await ctx.env.DB.prepare(
    `INSERT INTO kv_store (user_id, db_name, data, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (user_id, db_name)
     DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  )
    .bind(user.userId, dbName, JSON.stringify(records))
    .run();

  return new Response(null, { status: 204 });
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const user = await getSessionUser(ctx.request, ctx.env);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const dbName = ctx.params.dbName as string;
  await ctx.env.DB.prepare(
    "DELETE FROM kv_store WHERE user_id = ? AND db_name = ?"
  )
    .bind(user.userId, dbName)
    .run();

  return new Response(null, { status: 204 });
};
