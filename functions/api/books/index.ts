import { requireAdmin, requireUser } from "../../lib/auth";

const SUPPORTED_FORMATS = new Set([
  "epub", "pdf", "mobi", "azw3", "azw", "txt", "fb2",
  "cbr", "cbz", "cbt", "cb7", "md", "docx",
  "html", "xml", "xhtml", "mhtml", "htm",
]);

// Content-Type stored on the R2 object is derived from this map, never from
// the uploader's declared file.type — that header is attacker-controlled and
// streamR2Object() echoes it back verbatim, so trusting it lets an upload of
// e.g. "book.epub" with Content-Type: text/html render as HTML (stored XSS)
// to any signed-in user who opens the file/cover URL directly.
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  mobi: "application/x-mobipocket-ebook",
  azw3: "application/vnd.amazon.ebook",
  azw: "application/vnd.amazon.ebook",
  txt: "text/plain",
  fb2: "application/x-fictionbook+xml",
  cbr: "application/vnd.comicbook-rar",
  cbz: "application/vnd.comicbook+zip",
  cbt: "application/x-tar",
  cb7: "application/x-7z-compressed",
  md: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/plain",
  xml: "text/plain",
  xhtml: "text/plain",
  mhtml: "text/plain",
  htm: "text/plain",
};

const COVER_CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const EXT_BY_COVER_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

// Lets the admin bulk-upload flow attach a cover matched via
// /api/admin/metadata-search (a Google Books/Open Library image URL)
// without the browser having to fetch a third-party image itself, which
// would hit CORS since those aren't our origin. Fetching server-side avoids
// that entirely. The response's own Content-Type decides the stored
// extension/type - never the URL's file extension or any client-declared
// value - and only recognized image types are stored at all, same
// don't-trust-client-input posture as the multipart `cover` field above.
async function fetchAndStoreCoverFromUrl(
  bucket: R2Bucket,
  bookId: string,
  coverUrl: string
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(coverUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  let response: Response;
  try {
    response = await fetch(parsed.toString());
  } catch {
    return null;
  }
  if (!response.ok || !response.body) return null;

  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
  const ext = EXT_BY_COVER_CONTENT_TYPE[contentType];
  if (!ext) return null;

  const coverKey = `books/${bookId}/cover.${ext}`;
  await bucket.put(coverKey, response.body, { httpMetadata: { contentType } });
  return coverKey;
}

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
  const coverUrl = (form.get("coverUrl") as string | null)?.trim();

  const id = crypto.randomUUID();
  const fileKey = `books/${id}/file.${ext}`;

  await ctx.env.BOOK_FILES.put(fileKey, file.stream(), {
    httpMetadata: { contentType: CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream" },
  });

  let coverKey: string | null = null;
  if (cover instanceof File && cover.size > 0) {
    const coverExt = (cover.name.split(".").pop() || "jpg").toLowerCase();
    coverKey = `books/${id}/cover.${coverExt}`;
    await ctx.env.BOOK_FILES.put(coverKey, cover.stream(), {
      httpMetadata: { contentType: COVER_CONTENT_TYPE_BY_EXT[coverExt] || "image/jpeg" },
    });
  } else if (coverUrl) {
    // From admin/bulkUpload's "Get metadata" match - a remote image URL, not
    // an uploaded file. See fetchAndStoreCoverFromUrl's own comment for why
    // this is fetched here rather than in the browser.
    coverKey = await fetchAndStoreCoverFromUrl(ctx.env.BOOK_FILES, id, coverUrl);
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
