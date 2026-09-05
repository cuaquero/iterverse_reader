import { requireAdmin, requireUser } from "../../lib/auth";
import { fetchAndStoreCoverFromUrl, storeCoverFile } from "../../lib/r2";

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

// Admin-only: edit an existing catalog entry's title/author/cover after
// upload, without having to remove and re-add it. A "Get metadata" match
// (admin/editBookRow.tsx, reusing /api/admin/metadata-search) can be applied
// here just as well as at initial upload time.
export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (!auth.ok) return auth.response;

  const id = ctx.params.id as string;
  const existing = await ctx.env.DB.prepare(
    "SELECT title, author, cover_key FROM books WHERE id = ?"
  )
    .bind(id)
    .first<{ title: string; author: string | null; cover_key: string | null }>();
  if (!existing) return new Response("Not found", { status: 404 });

  const contentType = ctx.request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return new Response("Expected multipart/form-data", { status: 400 });
  }
  const form = await ctx.request.formData();

  // Title: only overwritten by a non-empty value - an empty submission is
  // treated as "leave it alone" rather than accepted as-is, since an
  // untitled catalog entry isn't useful. Author: the client always sends
  // this field (even to intentionally clear it), so its presence alone
  // decides whether to touch it; an empty value clears to null, matching
  // how POST treats a blank author on initial upload.
  const titleInput = (form.get("title") as string | null)?.trim();
  const title = titleInput ? titleInput : existing.title;
  const author = form.has("author")
    ? (form.get("author") as string | null)?.trim() || null
    : existing.author;

  const cover = form.get("cover");
  const coverUrl = (form.get("coverUrl") as string | null)?.trim();
  const removeCover = form.get("removeCover") === "true";

  let coverKey = existing.cover_key;
  let oldCoverKeyToDelete: string | null = null;

  if (cover instanceof File && cover.size > 0) {
    oldCoverKeyToDelete = existing.cover_key;
    coverKey = await storeCoverFile(ctx.env.BOOK_FILES, id, cover);
  } else if (coverUrl) {
    const fetched = await fetchAndStoreCoverFromUrl(ctx.env.BOOK_FILES, id, coverUrl);
    if (fetched) {
      oldCoverKeyToDelete = existing.cover_key;
      coverKey = fetched;
    }
  } else if (removeCover) {
    oldCoverKeyToDelete = existing.cover_key;
    coverKey = null;
  }

  // storeCoverFile/fetchAndStoreCoverFromUrl key covers deterministically
  // as books/{id}/cover.{ext} - a same-extension replacement overwrites the
  // old object in place at an unchanged key, so only delete the old key
  // when it actually differs, or this would erase the cover it just wrote.
  if (oldCoverKeyToDelete && oldCoverKeyToDelete !== coverKey) {
    await ctx.env.BOOK_FILES.delete(oldCoverKeyToDelete);
  }

  await ctx.env.DB.prepare(
    `UPDATE books SET title = ?, author = ?, cover_key = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(title, author, coverKey, id)
    .run();

  return Response.json({ id, title, author, hasCover: !!coverKey });
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
