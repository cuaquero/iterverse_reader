import { requireAdmin } from "../../lib/auth";
import { searchGoogleBooks, searchOpenLibrary } from "../../lib/bookMetadataSearch";

// Replaces the upstream Koodo "Get metadata" dialog's call to Koodo's own
// cloud service (src/components/dialogs/metadataDialog) - that dialog used
// to be gated behind isAuthed meaning "Pro subscriber"; now that isAuthed
// means "real signed-in session", leaving it wired to Koodo's backend would
// silently send every signed-in user's search terms to a third party we
// don't control. Scoped to admins only here, matching /api/books' upload
// gating, since this is a catalog-curation tool, not a per-student feature.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (!auth.ok) return auth.response;

  const url = new URL(ctx.request.url);
  const name = (url.searchParams.get("name") || "").trim();
  const author = (url.searchParams.get("author") || "").trim();
  if (!name && !author) {
    return Response.json({ results: [] });
  }

  const googleResults = await searchGoogleBooks(ctx.env, name, author);
  if (googleResults.length > 0) {
    return Response.json({ results: googleResults });
  }

  // Open Library only runs when Google Books comes up empty (including on
  // error - both search functions swallow their own failures to []). A
  // fallback, not a merge, by design.
  const openLibraryResults = await searchOpenLibrary(name, author);
  return Response.json({ results: openLibraryResults });
};
