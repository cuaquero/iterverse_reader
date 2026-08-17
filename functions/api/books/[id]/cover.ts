import { requireUser } from "../../../lib/auth";
import { streamR2Object } from "../../../lib/r2";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const auth = await requireUser(ctx.request, ctx.env);
  if (!auth.ok) return auth.response;

  const id = ctx.params.id as string;
  const book = await ctx.env.DB.prepare(
    "SELECT cover_key FROM books WHERE id = ?"
  )
    .bind(id)
    .first<{ cover_key: string | null }>();
  if (!book || !book.cover_key) return new Response("Not found", { status: 404 });

  return streamR2Object(ctx.env.BOOK_FILES, book.cover_key, ctx.request);
};
