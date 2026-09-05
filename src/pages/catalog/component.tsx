import React from "react";
import "./catalog.css";
import { CatalogProps, CatalogState, CatalogBookSummary } from "./interface";
import { Trans } from "react-i18next";
import toast from "react-hot-toast";
import BookUtil from "../../utils/file/bookUtil";
import DatabaseService from "../../utils/storage/databaseService";
import BookModel from "../../models/Book";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

const normalize = (value: string | null | undefined) =>
  (value || "").trim().toLowerCase();

// Students browse and read from this admin-curated catalog instead of
// importing their own files (gated in src/containers/header/component.tsx
// and src/pages/manager/component.tsx). This view fetches the shared
// catalog from the real backend (functions/api/books) and, on click, pipes
// the book through the exact same import pipeline personal uploads use
// (src/components/importLocal/component.tsx's getMd5WithBrowser, reached
// here via the same Redux-registered importBookFunc), so the resulting
// record/progress/bookmarks are indistinguishable from a normal import.
// Only the metadata record is synced through the backend either way - the
// downloaded file bytes still land in this browser's localforage only,
// same as any other imported book.
class Catalog extends React.Component<CatalogProps, CatalogState> {
  constructor(props: CatalogProps) {
    super(props);
    this.state = {
      view: "loading",
      books: [],
      error: null,
      openingId: null,
    };
  }

  componentDidMount() {
    this.loadCatalog();
  }

  loadCatalog = async () => {
    this.setState({ view: "loading", error: null });
    try {
      const res = await fetch("/api/books", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      this.setState({ books: data.books || [], view: "ready" });
    } catch (e: any) {
      this.setState({
        view: "error",
        error: e?.message || this.props.t("Failed to load the catalog"),
      });
    }
  };

  // The catalog API doesn't hand out MD5s before download, so "do I
  // already have this" can only be checked by title+author here. If a
  // local record already matches, open it directly instead of
  // re-downloading and re-importing (which would just bounce off the
  // importer's own MD5 dedupe with a "Duplicate book" toast anyway).
  findExistingLocalMatch = async (
    book: CatalogBookSummary
  ): Promise<BookModel | null> => {
    const localBooks: BookModel[] =
      (await DatabaseService.getAllRecords("books")) || [];
    const title = normalize(book.title);
    const author = normalize(book.author);
    const match = localBooks.find(
      (b) => normalize(b.name) === title && normalize(b.author) === author
    );
    if (!match) return null;

    // A metadata record with no actual file behind it (seen in the wild:
    // a local storage inconsistency, or left over from a broken import
    // before the catalog-open fix) sends BookUtil.redirectBook down its
    // "maybe it's in a configured cloud data source" fallback - a legacy
    // path from upstream Koodo's cloud-drive sync this deployment doesn't
    // use, which just toasts "Please add data source..." instead of
    // opening anything. Treat "no file" as "don't actually have this book"
    // and drop the orphaned record, so the normal download-and-import path
    // below runs a real, complete import instead of either hitting that
    // toast or bouncing off the importer's own MD5 dedupe against a record
    // that was never actually readable.
    const hasFile = await BookUtil.isBookExist(
      match.key,
      match.format.toLowerCase(),
      match.path || ""
    );
    if (!hasFile) {
      await DatabaseService.deleteRecord(match.key, "books");
      return null;
    }
    return match;
  };

  handleOpenBook = async (book: CatalogBookSummary) => {
    if (this.state.openingId) return;
    this.setState({ openingId: book.id });
    try {
      const existing = await this.findExistingLocalMatch(book);
      if (existing) {
        BookUtil.redirectBook(existing);
        return;
      }

      toast.loading(this.props.t("Downloading") + ": " + book.title, {
        id: "catalog-download",
      });
      const res = await fetch(`/api/books/${book.id}/file`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const blob = await res.blob();
      const contentType = res.headers.get("content-type") || blob.type || "";
      const fileName = `${book.title || "book"}.${book.format}`;
      const file = new File([blob], fileName, { type: contentType });

      const beforeKeys = new Set(
        ((await DatabaseService.getAllRecords("books")) || []).map(
          (b: BookModel) => b.key
        )
      );

      await this.props.importBookFunc(file);

      const afterRecords: BookModel[] =
        (await DatabaseService.getAllRecords("books")) || [];
      const newRecord = afterRecords.find((b) => !beforeKeys.has(b.key));

      toast.dismiss("catalog-download");

      if (newRecord) {
        BookUtil.redirectBook(newRecord);
      } else {
        // The import pipeline already toasted its own reason (unsupported
        // format, parse failure, an MD5 match under a different
        // title/author, etc) - just make sure we don't look like we
        // silently succeeded.
        toast.error(this.props.t("Could not open") + ": " + book.title);
      }
    } catch (e: any) {
      toast.dismiss("catalog-download");
      toast.error(
        this.props.t("Import failed") + ": " + (e?.message || book.title)
      );
    } finally {
      this.setState({ openingId: null });
    }
  };

  render() {
    const { view, books, error, openingId } = this.state;
    return (
      <>
        <div
          className="catalog-header"
          style={
            this.props.isCollapsed
              ? { width: "calc(100% - 70px)", left: "70px" }
              : {}
          }
        >
          <div className="catalog-title">
            <Trans>Book catalog</Trans>
          </div>
          {view === "ready" && (
            <div className="catalog-count">
              <Trans i18nKey="Total books" count={books.length}>
                {"Total " + books.length + " books"}
              </Trans>
            </div>
          )}
        </div>
        <div
          className="catalog-container-parent"
          style={
            this.props.isCollapsed
              ? { width: "calc(100vw - 70px)", left: "70px" }
              : {}
          }
        >
          <div className="catalog-container">
            {view === "loading" && (
              <div className="catalog-status">
                <Trans>Loading...</Trans>
              </div>
            )}
            {view === "error" && (
              <div className="catalog-status catalog-error">
                <div>{error}</div>
                <button className="catalog-retry-btn" onClick={this.loadCatalog}>
                  <Trans>Retry</Trans>
                </button>
              </div>
            )}
            {view === "ready" && books.length === 0 && (
              <div className="catalog-status">
                <Trans>No books in the catalog yet</Trans>
              </div>
            )}
            {view === "ready" && books.length > 0 && (
              <ul className="catalog-grid">
                {books.map((book) => (
                  <li
                    key={book.id}
                    className="catalog-card"
                    onClick={() => this.handleOpenBook(book)}
                  >
                    <div className="catalog-cover">
                      {book.hasCover ? (
                        <img
                          src={`/api/books/${book.id}/cover`}
                          alt={book.title}
                          loading="lazy"
                        />
                      ) : (
                        <div className="catalog-cover-placeholder">
                          <span className="catalog-cover-format">
                            {book.format?.toUpperCase()}
                          </span>
                          <span className="catalog-cover-title">
                            {book.title}
                          </span>
                        </div>
                      )}
                      {openingId === book.id && (
                        <div className="catalog-cover-loading">
                          <Trans>Loading...</Trans>
                        </div>
                      )}
                    </div>
                    <div className="catalog-card-title" title={book.title}>
                      {book.title}
                    </div>
                    <div
                      className="catalog-card-author"
                      title={book.author || ""}
                    >
                      {book.author || "—"}
                    </div>
                    <div className="catalog-card-meta">
                      <span className="catalog-card-format">
                        {book.format?.toUpperCase()}
                      </span>
                      <span className="catalog-card-size">
                        {formatBytes(book.fileSize)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </>
    );
  }
}

export default Catalog;
