import React from "react";
import "./admin.css";
import { AdminProps, AdminState, AdminBook, AdminUserRow } from "./interface";
import { withRouter } from "react-router-dom";
import { Trans } from "react-i18next";
import { ConfigService } from "../../assets/lib/kookit-extra-browser.min";
import { extractBookMetadata } from "../../utils/file/bookMetadataExtractor";

function formatBytes(bytes: number): string {
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso.replace(" ", "T") + "Z").toLocaleString();
}

class Admin extends React.Component<AdminProps, AdminState> {
  // Bumped on every book-file selection so a slow extractBookMetadata() call
  // for a file the admin has since replaced can't clobber state after the fact.
  private extractionSeq = 0;

  constructor(props: AdminProps) {
    super(props);
    this.state = {
      view: "loading",
      activeTab: "books",
      meUserId: null,

      books: [],
      booksError: null,
      deletingBookId: null,

      uploadTitle: "",
      uploadAuthor: "",
      uploadFile: null,
      uploadCover: null,
      uploadCoverPreviewUrl: null,
      isExtractingMetadata: false,
      isUploading: false,
      uploadError: null,

      users: [],
      usersError: null,
      updatingUserId: null,
    };
  }

  componentDidMount() {
    this.checkAccess();
  }

  componentWillUnmount() {
    this.revokeCoverPreview();
  }

  revokeCoverPreview = () => {
    if (this.state.uploadCoverPreviewUrl) {
      URL.revokeObjectURL(this.state.uploadCoverPreviewUrl);
    }
  };

  checkAccess = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status !== 200) {
        this.setState({ view: "unauthorized" });
        return;
      }
      const data = await res.json();
      if (!data.user || data.user.role !== "admin") {
        this.setState({ view: "unauthorized" });
        return;
      }
      this.setState({ view: "ready", meUserId: data.user.userId });
      this.loadBooks();
      this.loadUsers();
    } catch {
      this.setState({ view: "unauthorized" });
    }
  };

  loadBooks = async () => {
    try {
      const res = await fetch("/api/books", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      this.setState({ books: data.books, booksError: null });
    } catch (e: any) {
      this.setState({ booksError: e.message || "Failed to load books" });
    }
  };

  loadUsers = async () => {
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      this.setState({ users: data.users, usersError: null });
    } catch (e: any) {
      this.setState({ usersError: e.message || "Failed to load users" });
    }
  };

  // Auto-extract title/author/cover from the selected book file, the same
  // way personal import always has (see ImportLocal.handleBook and
  // src/utils/file/bookMetadataExtractor.ts). Extraction only fills in
  // fields that come back non-empty and never overwrites text the admin has
  // already typed, so it's always safe to re-run when the file changes. A
  // format with no extractable metadata (txt, docx, html, ...) or a parse
  // failure simply leaves manual entry in place - upload is never blocked.
  handleBookFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    const seq = ++this.extractionSeq;

    this.revokeCoverPreview();
    this.setState({
      uploadFile: file,
      uploadCover: null,
      uploadCoverPreviewUrl: null,
      uploadError: null,
    });

    if (!file) return;

    this.setState({ isExtractingMetadata: true });
    let extracted: Awaited<ReturnType<typeof extractBookMetadata>> = null;
    try {
      extracted = await extractBookMetadata(file);
    } catch (error) {
      console.error("Book metadata extraction failed:", error);
    }

    // A different file was picked while this extraction was still running -
    // its result no longer applies.
    if (seq !== this.extractionSeq) return;

    this.setState((prev) => ({
      uploadTitle: extracted?.title ? extracted.title : prev.uploadTitle,
      uploadAuthor: extracted?.author ? extracted.author : prev.uploadAuthor,
      uploadCover: extracted?.coverFile || null,
      uploadCoverPreviewUrl: extracted?.coverFile
        ? URL.createObjectURL(extracted.coverFile)
        : null,
      isExtractingMetadata: false,
    }));
  };

  handleManualCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    this.revokeCoverPreview();
    this.setState({
      uploadCover: file,
      uploadCoverPreviewUrl: file ? URL.createObjectURL(file) : null,
    });
  };

  handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const { uploadFile, uploadCover, uploadTitle, uploadAuthor } = this.state;
    if (!uploadFile) {
      this.setState({ uploadError: this.props.t("Choose a book file first") });
      return;
    }

    this.setState({ isUploading: true, uploadError: null });

    const form = new FormData();
    form.append("file", uploadFile);
    if (uploadCover) form.append("cover", uploadCover);
    if (uploadTitle.trim()) form.append("title", uploadTitle.trim());
    if (uploadAuthor.trim()) form.append("author", uploadAuthor.trim());

    try {
      const res = await fetch("/api/books", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      this.revokeCoverPreview();
      this.setState({
        uploadTitle: "",
        uploadAuthor: "",
        uploadFile: null,
        uploadCover: null,
        uploadCoverPreviewUrl: null,
        isUploading: false,
      });
      (document.getElementById("admin-upload-form") as HTMLFormElement)?.reset();
      this.loadBooks();
    } catch (e: any) {
      this.setState({ isUploading: false, uploadError: e.message || "Upload failed" });
    }
  };

  handleDeleteBook = async (book: AdminBook) => {
    if (!window.confirm(this.props.t("Remove this book from the catalog?") + ` (${book.title})`)) {
      return;
    }
    this.setState({ deletingBookId: book.id });
    try {
      const res = await fetch(`/api/books/${book.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());
      this.setState((prev) => ({
        books: prev.books.filter((b) => b.id !== book.id),
        deletingBookId: null,
      }));
    } catch (e: any) {
      this.setState({ deletingBookId: null, booksError: e.message || "Delete failed" });
    }
  };

  handleToggleRole = async (user: AdminUserRow) => {
    const nextRole = user.role === "admin" ? "student" : "admin";
    this.setState({ updatingUserId: user.id });
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      this.setState((prev) => ({
        users: prev.users.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u)),
        updatingUserId: null,
      }));
    } catch (e: any) {
      this.setState({ updatingUserId: null, usersError: e.message || "Role update failed" });
    }
  };

  isDark(): boolean {
    const skin = ConfigService.getReaderConfig("appSkin");
    const isOSNight = ConfigService.getReaderConfig("isOSNight");
    return skin === "night" || (skin === "system" && isOSNight === "yes");
  }

  renderBooksTab() {
    const {
      books,
      booksError,
      deletingBookId,
      uploadTitle,
      uploadAuthor,
      uploadCoverPreviewUrl,
      isExtractingMetadata,
      isUploading,
      uploadError,
    } = this.state;
    return (
      <>
        <form id="admin-upload-form" className="admin-upload-form" onSubmit={this.handleUpload}>
          <div className="admin-section-title">
            <Trans>Add a book</Trans>
          </div>
          <div className="admin-upload-fields">
            <label className="admin-file-label">
              <Trans>Book file</Trans>
              <input type="file" onChange={this.handleBookFileChange} />
            </label>
            {uploadCoverPreviewUrl && (
              <div className="admin-cover-preview">
                <img src={uploadCoverPreviewUrl} alt="" />
              </div>
            )}
            <input
              type="text"
              placeholder={this.props.t("Title (optional)")}
              value={uploadTitle}
              onChange={(e) => this.setState({ uploadTitle: e.target.value })}
            />
            <input
              type="text"
              placeholder={this.props.t("Author (optional)")}
              value={uploadAuthor}
              onChange={(e) => this.setState({ uploadAuthor: e.target.value })}
            />
            <label className="admin-file-label">
              {uploadCoverPreviewUrl
                ? this.props.t("Replace cover (optional)")
                : this.props.t("Cover (optional)")}
              <input type="file" accept="image/*" onChange={this.handleManualCoverChange} />
            </label>
            <button type="submit" disabled={isUploading} className="admin-primary-btn">
              {isUploading ? this.props.t("Uploading...") : this.props.t("Upload")}
            </button>
          </div>
          {isExtractingMetadata && (
            <div className="admin-extracting-hint">
              <Trans>Detecting title, author and cover from the book file...</Trans>
            </div>
          )}
          {uploadError && <div className="admin-error">{uploadError}</div>}
        </form>

        <div className="admin-section-title">
          <Trans>Shared catalog</Trans> ({books.length})
        </div>
        {booksError && <div className="admin-error">{booksError}</div>}
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>
                  <Trans>Title</Trans>
                </th>
                <th>
                  <Trans>Author</Trans>
                </th>
                <th>
                  <Trans>Format</Trans>
                </th>
                <th>
                  <Trans>Size</Trans>
                </th>
                <th>
                  <Trans>Added</Trans>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <tr key={book.id}>
                  <td>{book.title}</td>
                  <td>{book.author || "—"}</td>
                  <td className="admin-format-cell">{book.format}</td>
                  <td>{formatBytes(book.fileSize)}</td>
                  <td>{formatDate(book.createdAt)}</td>
                  <td>
                    <button
                      className="admin-danger-btn"
                      disabled={deletingBookId === book.id}
                      onClick={() => this.handleDeleteBook(book)}
                    >
                      {deletingBookId === book.id ? this.props.t("Removing...") : this.props.t("Remove")}
                    </button>
                  </td>
                </tr>
              ))}
              {books.length === 0 && (
                <tr>
                  <td colSpan={6} className="admin-empty-row">
                    <Trans>No books in the catalog yet</Trans>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  renderUsersTab() {
    const { users, usersError, updatingUserId, meUserId } = this.state;
    return (
      <>
        <div className="admin-section-title">
          <Trans>Accounts</Trans> ({users.length})
        </div>
        {usersError && <div className="admin-error">{usersError}</div>}
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>
                  <Trans>Name</Trans>
                </th>
                <th>
                  <Trans>Email</Trans>
                </th>
                <th>
                  <Trans>Role</Trans>
                </th>
                <th>
                  <Trans>Last login</Trans>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name || "—"}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`admin-role-badge admin-role-${user.role}`}>{user.role}</span>
                  </td>
                  <td>{formatDate(user.lastLoginAt)}</td>
                  <td>
                    <button
                      className="admin-secondary-btn"
                      disabled={updatingUserId === user.id || user.id === meUserId}
                      title={user.id === meUserId ? this.props.t("Cannot change your own role") : ""}
                      onClick={() => this.handleToggleRole(user)}
                    >
                      {updatingUserId === user.id
                        ? this.props.t("Updating...")
                        : user.role === "admin"
                          ? this.props.t("Demote to student")
                          : this.props.t("Promote to admin")}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-empty-row">
                    <Trans>No accounts have signed in yet</Trans>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  render() {
    const { view, activeTab } = this.state;
    const isDark = this.isDark();

    return (
      <div className={`admin-page ${isDark ? "admin-dark" : "admin-light"}`}>
        <div className="admin-close-btn" onClick={() => this.props.history.push("/manager/home")}>
          <span className="icon-close"></span>
        </div>

        <div className="admin-title">
          <Trans>Catalog Admin</Trans>
        </div>

        {view === "loading" && (
          <div className="admin-status">
            <Trans>Loading...</Trans>
          </div>
        )}

        {view === "unauthorized" && (
          <div className="admin-status">
            <Trans>You need an admin account to view this page</Trans>
          </div>
        )}

        {view === "ready" && (
          <>
            <div className="admin-tabs">
              <button
                className={`admin-tab ${activeTab === "books" ? "admin-tab-active" : ""}`}
                onClick={() => this.setState({ activeTab: "books" })}
              >
                <Trans>Books</Trans>
              </button>
              <button
                className={`admin-tab ${activeTab === "users" ? "admin-tab-active" : ""}`}
                onClick={() => this.setState({ activeTab: "users" })}
              >
                <Trans>Users</Trans>
              </button>
            </div>
            <div className="admin-content">
              {activeTab === "books" ? this.renderBooksTab() : this.renderUsersTab()}
            </div>
          </>
        )}
      </div>
    );
  }
}

export default withRouter(Admin as any);
