import React from "react";
import { Trans } from "react-i18next";
import { AdminBook } from "./interface";
import { formatBytes, formatDate } from "./component";
import MetadataDialog from "../../components/dialogs/metadataDialog";
import { MetadataResult } from "../../components/dialogs/metadataDialog/interface";

interface EditBookRowProps {
  book: AdminBook;
  t: (title: string) => string;
  deletingBookId: string | null;
  onSaved: () => void;
  onDeleteRequested: (book: AdminBook) => void;
}

interface EditBookRowState {
  isEditing: boolean;
  title: string;
  author: string;
  // Same three-way cover model as bulkUpload.tsx: coverFile (a picked/
  // matched local File, uploaded as multipart `cover`), coverUrl (a remote
  // "Get metadata" match, sent as `coverUrl` and fetched server-side to
  // avoid a CORS-blocked browser fetch - see functions/api/books/[id].ts),
  // removeCover (explicitly clear the existing cover). Setting one clears
  // the others.
  coverFile: File | null;
  coverObjectUrl: string | null;
  coverUrl: string | null;
  removeCover: boolean;
  isSaving: boolean;
  error: string | null;
  isMetadataSearchOpen: boolean;
}

class EditBookRow extends React.Component<EditBookRowProps, EditBookRowState> {
  constructor(props: EditBookRowProps) {
    super(props);
    this.state = this.freshEditState();
  }

  freshEditState = (): EditBookRowState => ({
    isEditing: false,
    title: this.props.book.title,
    author: this.props.book.author || "",
    coverFile: null,
    coverObjectUrl: null,
    coverUrl: null,
    removeCover: false,
    isSaving: false,
    error: null,
    isMetadataSearchOpen: false,
  });

  componentWillUnmount() {
    if (this.state.coverObjectUrl) URL.revokeObjectURL(this.state.coverObjectUrl);
  }

  handleStartEdit = () => {
    this.setState({ ...this.freshEditState(), isEditing: true });
  };

  handleCancel = () => {
    if (this.state.coverObjectUrl) URL.revokeObjectURL(this.state.coverObjectUrl);
    this.setState({ isEditing: false });
  };

  handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (this.state.coverObjectUrl) URL.revokeObjectURL(this.state.coverObjectUrl);
    this.setState({
      coverFile: file,
      coverObjectUrl: URL.createObjectURL(file),
      coverUrl: null,
      removeCover: false,
    });
  };

  handleRemoveCover = () => {
    if (this.state.coverObjectUrl) URL.revokeObjectURL(this.state.coverObjectUrl);
    this.setState({
      coverFile: null,
      coverObjectUrl: null,
      coverUrl: null,
      removeCover: true,
    });
  };

  handleApplyMetadata = (metadata: MetadataResult) => {
    this.setState((prev) => {
      const patch: Partial<EditBookRowState> = {
        isMetadataSearchOpen: false,
        title: metadata.name || prev.title,
        author: metadata.author !== undefined ? metadata.author : prev.author,
      };
      // Only replace an existing/pending cover if the match actually has
      // one - don't discard a manual pick over a blank match.
      if (metadata.cover) {
        if (prev.coverObjectUrl) URL.revokeObjectURL(prev.coverObjectUrl);
        patch.coverFile = null;
        patch.coverObjectUrl = null;
        patch.coverUrl = metadata.cover;
        patch.removeCover = false;
      }
      return patch as EditBookRowState;
    });
  };

  handleSave = async () => {
    const { title, author, coverFile, coverUrl, removeCover } = this.state;
    if (!title.trim()) {
      this.setState({ error: this.props.t("Title is required") });
      return;
    }
    this.setState({ isSaving: true, error: null });

    const form = new FormData();
    form.append("title", title.trim());
    form.append("author", author.trim());
    if (coverFile) form.append("cover", coverFile);
    else if (coverUrl) form.append("coverUrl", coverUrl);
    else if (removeCover) form.append("removeCover", "true");

    try {
      const res = await fetch(`/api/books/${this.props.book.id}`, {
        method: "PATCH",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      if (this.state.coverObjectUrl) URL.revokeObjectURL(this.state.coverObjectUrl);
      this.setState({ isEditing: false, isSaving: false });
      this.props.onSaved();
    } catch (e: any) {
      this.setState({ isSaving: false, error: e.message || "Update failed" });
    }
  };

  render() {
    const { book, t, deletingBookId } = this.props;
    const {
      isEditing,
      title,
      author,
      coverObjectUrl,
      coverUrl,
      removeCover,
      isSaving,
      error,
      isMetadataSearchOpen,
    } = this.state;

    if (!isEditing) {
      return (
        <tr>
          <td>{book.title}</td>
          <td>{book.author || "—"}</td>
          <td className="admin-format-cell">{book.format}</td>
          <td>{formatBytes(book.fileSize)}</td>
          <td>{formatDate(book.createdAt)}</td>
          <td>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="admin-secondary-btn" onClick={this.handleStartEdit}>
                {t("Edit")}
              </button>
              <button
                className="admin-danger-btn"
                disabled={deletingBookId === book.id}
                onClick={() => this.props.onDeleteRequested(book)}
              >
                {deletingBookId === book.id ? t("Removing...") : t("Remove")}
              </button>
            </div>
          </td>
        </tr>
      );
    }

    const previewSrc =
      coverObjectUrl ||
      coverUrl ||
      (!removeCover && book.hasCover ? `/api/books/${book.id}/cover` : null);

    return (
      <tr>
        <td colSpan={6}>
          {/* A <div>-rooted dialog can't be a direct child of <tr> (invalid
              table markup - only <td>/<th> can), so it's nested in here
              instead. Its own container is position:absolute/centered via
              viewport-relative calc(), so where it sits in the tree doesn't
              affect how it looks. */}
          {isMetadataSearchOpen && (
            <MetadataDialog
              {...({
                currentBookName: title,
                currentBookAuthor: author,
                handleMetadataDialog: (isShow: boolean) =>
                  this.setState({ isMetadataSearchOpen: isShow }),
                handleApplyMetadata: this.handleApplyMetadata,
              } as any)}
            />
          )}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              flexWrap: "wrap",
              padding: "8px 0",
            }}
          >
            <label
              className="admin-bulk-cover-cell"
              title={t("Click to select image")}
              style={{ width: 40, height: 56 }}
            >
              {previewSrc ? (
                <img src={previewSrc} alt="" className="admin-bulk-cover-thumb" />
              ) : (
                <span className="admin-bulk-cover-placeholder">—</span>
              )}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={this.handleCoverChange}
              />
            </label>
            <input
              className="admin-bulk-input"
              style={{ maxWidth: 200 }}
              value={title}
              placeholder={t("Title")}
              onChange={(e) => this.setState({ title: e.target.value })}
            />
            <input
              className="admin-bulk-input"
              style={{ maxWidth: 200 }}
              value={author}
              placeholder={t("Author")}
              onChange={(e) => this.setState({ author: e.target.value })}
            />
            <button
              type="button"
              className="admin-secondary-btn"
              onClick={() => this.setState({ isMetadataSearchOpen: true })}
            >
              {t("Get metadata")}
            </button>
            {previewSrc && (
              <button
                type="button"
                className="admin-secondary-btn"
                onClick={this.handleRemoveCover}
              >
                <Trans>Remove cover</Trans>
              </button>
            )}
            <button
              type="button"
              className="admin-primary-btn"
              disabled={isSaving}
              onClick={this.handleSave}
            >
              {isSaving ? t("Saving...") : t("Save")}
            </button>
            <button type="button" className="admin-secondary-btn" onClick={this.handleCancel}>
              <Trans>Cancel</Trans>
            </button>
          </div>
          {error && <div className="admin-error">{error}</div>}
        </td>
      </tr>
    );
  }
}

export default EditBookRow;
