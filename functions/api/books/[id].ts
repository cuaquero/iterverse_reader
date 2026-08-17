import { requireAdmin, requireUser } from "../../lib/auth";

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  format: string;
  file_key: string;
  cover_key: string | null;
  file_size: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const auth = await requireUser(ctx.request, ctx.env);
  if (!auth.ok) return auth.response;

  const id = ctx.params.id as string;
  const book = await ctx.env.DB.prepare("SELECT * FROM books WHERE id = ?")
    .bind(id)
    .first<BookRow>();
  if (!book) return new Response("Not found", { status: 404 });

  return Response.json({
    id: book.id,
    title: book.title,
    author: book.author,
    format: book.format,
    fileSize: book.file_size,
    uploadedBy: book.uploaded_by,
    createdAt: book.created_at,
    updatedAt: book.updated_at,
    hasCover: !!book.cover_key,
  });
};

// Only admins can remove books from the shared catalog.
export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (!auth.ok) return auth.response;

  const id = ctx.params.id as string;
  const book = await ctx.env.DB.prepare(
    "SELECT file_key, cover_key FROM books WHERE id = ?"
  )
    .bind(id)
    .first<{ file_key: string; cover_key: string | null }>();
  if (!book) return new Response("Not found", { status: 404 });

  const keysToDelete = [book.file_key, book.cover_key].filter(
    (k): k is string => !!k
  );
  if (keysToDelete.length > 0) {
    await ctx.env.BOOK_FILES.delete(keysToDelete);
  }
  await ctx.env.DB.prepare("DELETE FROM books WHERE id = ?").bind(id).run();

  return new Response(null, { status: 204 });
};
