// Admin catalog-curation "find metadata by title/author" search, replacing
// the upstream Koodo metadata dialog's call to Koodo's own cloud service
// (see functions/api/admin/metadata-search.ts's own comment for why that had
// to go). Google Books is tried first - best real-world coverage for actual
// textbooks/trade books, plus a description field Open Library's search
// endpoint doesn't return. Open Library is a free, no-key fallback for
// whatever Google Books misses.

export interface MetadataSearchResult {
  key: string;
  name: string;
  author: string;
  publisher?: string;
  description?: string;
  cover?: string;
  source: "Google Books" | "Open Library";
}

function toHttps(url: string | undefined): string | undefined {
  return url ? url.replace(/^http:/, "https:") : url;
}

export async function searchGoogleBooks(
  env: Env,
  name: string,
  author: string
): Promise<MetadataSearchResult[]> {
  const terms: string[] = [];
  if (name) terms.push(`intitle:${name}`);
  if (author) terms.push(`inauthor:${author}`);
  if (terms.length === 0) return [];

  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", terms.join("+"));
  url.searchParams.set("maxResults", "10");
  // Unauthenticated requests work fine at this volume (admin curation, not a
  // per-student feature) - a key only raises the daily quota if that's ever
  // needed.
  if (env.GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", env.GOOGLE_BOOKS_API_KEY);

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const data = await response.json<{ items?: any[] }>().catch(() => ({ items: [] }));

  return (data.items || [])
    .map((item): MetadataSearchResult => {
      const info = item.volumeInfo || {};
      return {
        key: `google:${item.id}`,
        name: info.title || "",
        author: (info.authors || []).join(", "),
        publisher: info.publisher || undefined,
        description: info.description || undefined,
        cover: toHttps(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail),
        source: "Google Books",
      };
    })
    .filter((r) => r.name);
}

export async function searchOpenLibrary(
  name: string,
  author: string
): Promise<MetadataSearchResult[]> {
  if (!name && !author) return [];

  const url = new URL("https://openlibrary.org/search.json");
  if (name) url.searchParams.set("title", name);
  if (author) url.searchParams.set("author", author);
  url.searchParams.set("limit", "10");
  url.searchParams.set("fields", "key,title,author_name,publisher,cover_i");

  let response: Response;
  try {
    // Open Library asks API consumers to identify themselves via User-Agent
    // rather than requiring a key - see openlibrary.org/developers/api.
    response = await fetch(url.toString(), {
      headers: { "User-Agent": "IterverseReader/1.0 (admin catalog metadata search)" },
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const data = await response.json<{ docs?: any[] }>().catch(() => ({ docs: [] }));

  return (data.docs || [])
    .map((doc): MetadataSearchResult => ({
      key: `openlibrary:${doc.key}`,
      name: doc.title || "",
      author: (doc.author_name || []).join(", "),
      publisher: (doc.publisher || [])[0] || undefined,
      cover: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : undefined,
      source: "Open Library",
    }))
    .filter((r) => r.name);
}
