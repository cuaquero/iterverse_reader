// Streams an R2 object straight through as the Function's response body,
// rather than issuing a presigned URL — simpler to set up (no R2 API-token
// signing needed) and the bucket itself stays fully private. Supports Range
// requests since EPUB/PDF readers commonly do partial reads.
export async function streamR2Object(
  bucket: R2Bucket,
  key: string,
  request: Request
): Promise<Response> {
  const rangeHeader = request.headers.get("Range");
  const parsedRange = rangeHeader ? parseRangeHeader(rangeHeader) : null;

  if (!parsedRange) {
    const object = await bucket.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("accept-ranges", "bytes");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { status: 200, headers });
  }

  // A ranged get() returns only the slice's size, not the original object's —
  // head() first to learn the true total so Content-Range can be built.
  const meta = await bucket.head(key);
  if (!meta) return new Response("Not found", { status: 404 });
  const total = meta.size;
  const { offset, length } = normalizeRange(parsedRange, total);

  const object = await bucket.get(key, { range: { offset, length } });
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("content-length", String(length));
  headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${total}`);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { status: 206, headers });
}

function normalizeRange(range: R2Range, total: number): { offset: number; length: number } {
  if (range.suffix !== undefined) {
    const length = Math.min(range.suffix, total);
    return { offset: total - length, length };
  }
  const offset = range.offset ?? 0;
  const length =
    range.length !== undefined ? Math.min(range.length, total - offset) : total - offset;
  return { offset, length };
}

function parseRangeHeader(header: string): R2Range | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return undefined;
  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") return undefined;
  if (startStr === "") return { suffix: parseInt(endStr, 10) };
  const offset = parseInt(startStr, 10);
  if (endStr === "") return { offset };
  return { offset, length: parseInt(endStr, 10) - offset + 1 };
}

// Shared by both POST /api/books (new upload) and PATCH /api/books/:id
// (editing an existing catalog entry's cover) - Content-Type is always
// derived from a validated extension/response header, never trusted from
// the uploader/URL, same don't-trust-client-input posture as the book file
// itself (see CONTENT_TYPE_BY_EXT's own comment in api/books/index.ts).
export const COVER_CONTENT_TYPE_BY_EXT: Record<string, string> = {
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

export async function storeCoverFile(
  bucket: R2Bucket,
  bookId: string,
  cover: File
): Promise<string> {
  const coverExt = (cover.name.split(".").pop() || "jpg").toLowerCase();
  const coverKey = `books/${bookId}/cover.${coverExt}`;
  await bucket.put(coverKey, cover.stream(), {
    httpMetadata: { contentType: COVER_CONTENT_TYPE_BY_EXT[coverExt] || "image/jpeg" },
  });
  return coverKey;
}

// Lets the admin bulk-upload/edit flow attach a cover matched via
// /api/admin/metadata-search (a Google Books/Open Library image URL)
// without the browser having to fetch a third-party image itself, which
// would hit CORS since those aren't our origin. Fetching server-side avoids
// that entirely. The response's own Content-Type decides the stored
// extension/type - never the URL's file extension or any client-declared
// value - and only recognized image types are stored at all.
export async function fetchAndStoreCoverFromUrl(
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
