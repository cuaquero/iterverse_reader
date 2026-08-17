import { requireAdmin, requireUser } from "../../lib/auth";

const SUPPORTED_FORMATS = new Set([
  "epub", "pdf", "mobi", "azw3", "azw", "txt", "fb2",
  "cbr", "cbz", "cbt", "cb7", "md", "docx",
  "html", "xml", "xhtml", "mhtml", "htm",
]);

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  format: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  cover_key: string | null;
}

// Every signed-in user (student or admin) reads the same shared catalog.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const auth = await requireUser(ctx.request, ctx.env);
  if (!auth.ok) return auth.response;

  const { results } = await ctx.env.DB.prepare(
    `SELECT id, title, author, format, file_size, uploaded_by, created_at, updated_at, cover_key
     FROM books ORDER BY created_at DESC`
  ).all<BookRow>();

  return Response.json({
    books: results.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      format: b.format,
      fileSize: b.file_size,
      uploadedBy: b.uploaded_by,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
      hasCover: !!b.cover_key,
    })),
  });
};

// Only admins can add to the shared catalog.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (!auth.ok) return auth.response;

  const contentType = ctx.request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return new Response("Expected multipart/form-data with a 'file' field", { status: 400 });
  }

  const form = await ctx.request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return new Response("Missing 'file' field", { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!SUPPORTED_FORMATS.has(ext)) {
    return new Response(
      `Unsupported format ".${ext}". Supported: ${[...SUPPORTED_FORMATS].join(", ")}`,
      { status: 400 }
    );
  }

  const title = (form.get("title") as string | null)?.trim() || file.name.replace(/\.[^.]+$/, "");
  const author = (form.get("author") as string | null)?.trim() || null;
  const cover = form.get("cover");

  const id = crypto.randomUUID();
  const fileKey = `books/${id}/file.${ext}`;

  await ctx.env.BOOK_FILES.put(fileKey, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  let coverKey: string | null = null;
  if (cover instanceof File && cover.size > 0) {
    const coverExt = (cover.name.split(".").pop() || "jpg").toLowerCase();
    coverKey = `books/${id}/cover.${coverExt}`;
    await ctx.env.BOOK_FILES.put(coverKey, cover.stream(), {
      httpMetadata: { contentType: cover.type || "image/jpeg" },
    });
  }

  await ctx.env.DB.prepare(
    `INSERT INTO books (id, title, author, format, file_key, cover_key, file_size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, title, author, ext, fileKey, coverKey, file.size, auth.user.userId)
    .run();

  return Response.json(
    { id, title, author, format: ext, fileSize: file.size, hasCover: !!coverKey },
    { status: 201 }
  );
};
