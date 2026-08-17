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
