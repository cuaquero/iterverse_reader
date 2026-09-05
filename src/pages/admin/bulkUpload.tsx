import React from "react";
import { Trans } from "react-i18next";
import MetadataDialog from "../../components/dialogs/metadataDialog";
import { MetadataResult } from "../../components/dialogs/metadataDialog/interface";
import { extractBookMetadata } from "../../utils/file/bookMetadataExtractor";

interface BulkUploadItem {
  id: string;
  file: File;
  // Two mutually-exclusive cover sources: coverFile from extraction/manual
  // pick (uploaded as multipart `cover`), coverUrl from a "Get metadata"
  // match (sent as `coverUrl`, fetched server-side - see
  // functions/api/books/index.ts's fetchAndStoreCoverFromUrl for why this
  // isn't fetched here in the browser instead). Picking one clears the
  // other. coverObjectUrl is just the local object URL for coverFile so it
  // can be revoked when replaced.
  coverFile: File | null;
  coverObjectUrl: string | null;
  coverUrl: string | null;
  title: string;
  author: string;
  isExtracting: boolean;
  status: "pending" | "uploading" | "done" | "error";
  error: string | null;
}

interface BulkUploadProps {
  t: (title: string) => string;
  onUploaded: () => void;
}

interface BulkUploadState {
  items: BulkUploadItem[];
  isUploading: boolean;
  metadataSearchItemId: string | null;
}

let nextRowId = 0;

class BulkUpload extends React.Component<BulkUploadProps, BulkUploadState> {
  constructor(props: BulkUploadProps) {
    super(props);
    this.state = { items: [], isUploading: false, metadataSearchItemId: null };
  }

  componentWillUnmount() {
    this.state.items.forEach((item) => {
      if (item.coverObjectUrl) URL.revokeObjectURL(item.coverObjectUrl);
    });
  }

  updateItem = (id: string, patch: Partial<BulkUploadItem>) => {
    this.setState((prev) => ({
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Allows picking the same file(s) again in a later batch.
    e.target.value = "";
    if (files.length === 0) return;

    const newItems: BulkUploadItem[] = files.map((file) => ({
      id: `row-${nextRowId++}`,
      file,
      coverFile: null,
      coverObjectUrl: null,
      coverUrl: null,
      title: file.name.replace(/\.[^.]+$/, ""),
      author: "",
      isExtracting: true,
      status: "pending",
      error: null,
    }));

    this.setState((prev) => ({ items: [...prev.items, ...newItems] }));
    newItems.forEach((item) => this.extractForItem(item.id, item.file));
  };

  // Mirrors admin/component.tsx's handleBookFileChange, just per-row: only
  // fills in fields that come back non-empty, never blocks upload on
  // failure or an unsupported format.
  extractForItem = async (id: string, file: File) => {
    let extracted: Awaited<ReturnType<typeof extractBookMetadata>> = null;
    try {
      extracted = await extractBookMetadata(file);
    } catch (error) {
      console.error("Book metadata extraction failed:", error);
    }

    this.setState((prev) => {
      const item = prev.items.find((i) => i.id === id);
      // Row got removed while extraction was running.
      if (!item) return { items: prev.items };
      if (extracted?.coverFile && item.coverObjectUrl) {
        URL.revokeObjectURL(item.coverObjectUrl);
      }
      return {
        items: prev.items.map((row) =>
          row.id === id
            ? {
                ...row,
                title: extracted?.title ? extracted.title : row.title,
                author: extracted?.author ? extracted.author : row.author,
                coverFile: extracted?.coverFile || row.coverFile,
                coverObjectUrl: extracted?.coverFile
                  ? URL.createObjectURL(extracted.coverFile)
                  : row.coverObjectUrl,
                isExtracting: false,
              }
            : row
        ),
      };
    });
  };

  handleManualCover = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const prevItem = this.state.items.find((i) => i.id === id);
    if (prevItem?.coverObjectUrl) URL.revokeObjectURL(prevItem.coverObjectUrl);
    this.updateItem(id, {
      coverFile: file,
      coverObjectUrl: URL.createObjectURL(file),
      coverUrl: null,
    });
  };

  handleApplyMetadataForItem = (id: string, metadata: MetadataResult) => {
    const item = this.state.items.find((i) => i.id === id);
    if (!item) return;
    const patch: Partial<BulkUploadItem> = {
      title: metadata.name || item.title,
      author: metadata.author !== undefined ? metadata.author : item.author,
    };
    // Only replace an existing cover if the match actually has one - don't
    // discard a perfectly good extracted/manual cover over a blank match.
    if (metadata.cover) {
      if (item.coverObjectUrl) URL.revokeObjectURL(item.coverObjectUrl);
      patch.coverFile = null;
      patch.coverObjectUrl = null;
      patch.coverUrl = metadata.cover;
    }
    this.updateItem(id, patch);
  };

  handleRemove = (id: string) => {
    this.setState((prev) => {
      const item = prev.items.find((i) => i.id === id);
      if (item?.coverObjectUrl) URL.revokeObjectURL(item.coverObjectUrl);
      return { items: prev.items.filter((i) => i.id !== id) };
    });
  };

  handleClearUploaded = () => {
    this.setState((prev) => {
      prev.items.forEach((item) => {
        if (item.status === "done" && item.coverObjectUrl) {
          URL.revokeObjectURL(item.coverObjectUrl);
        }
      });
      return { items: prev.items.filter((item) => item.status !== "done") };
    });
  };

  handleUploadAll = async () => {
    this.setState({ isUploading: true });
    // Snapshot which rows to run before the loop - rows added mid-upload
    // (or already-done rows) aren't re-processed.
    const idsToUpload = this.state.items
      .filter((item) => item.status === "pending" || item.status === "error")
      .map((item) => item.id);

    // Sequential, not parallel - keeps error attribution simple (one row's
    // failure doesn't race with another's status update) and avoids
    // hammering R2/D1 with N concurrent writes for what's an occasional
    // admin-curation action, not a latency-sensitive one.
    for (const id of idsToUpload) {
      const item = this.state.items.find((i) => i.id === id);
      if (!item) continue;
      this.updateItem(id, { status: "uploading", error: null });

      const form = new FormData();
      form.append("file", item.file);
      if (item.coverFile) form.append("cover", item.coverFile);
      else if (item.coverUrl) form.append("coverUrl", item.coverUrl);
      if (item.title.trim()) form.append("title", item.title.trim());
      if (item.author.trim()) form.append("author", item.author.trim());

      try {
        const res = await fetch("/api/books", {
          method: "POST",
          credentials: "include",
          body: form,
        });
        if (!res.ok) throw new Error(await res.text());
        this.updateItem(id, { status: "done" });
      } catch (e: any) {
        this.updateItem(id, { status: "error", error: e.message || "Upload failed" });
      }
    }

    this.setState({ isUploading: false });
    this.props.onUploaded();
  };

  render() {
    const { items, isUploading, metadataSearchItemId } = this.state;
    const { t } = this.props;
    const pendingCount = items.filter(
      (i) => i.status === "pending" || i.status === "error"
    ).length;
    const doneCount = items.filter((i) => i.status === "done").length;
    const metadataSearchItem = items.find((i) => i.id === metadataSearchItemId) || null;

    return (
      <div className="admin-bulk-upload">
        {metadataSearchItem && (
          <MetadataDialog
            {...({
              currentBookName: metadataSearchItem.title,
              currentBookAuthor: metadataSearchItem.author,
              handleMetadataDialog: (isShow: boolean) =>
                this.setState({ metadataSearchItemId: isShow ? metadataSearchItemId : null }),
              handleApplyMetadata: (metadata: MetadataResult) => {
                this.handleApplyMetadataForItem(metadataSearchItem.id, metadata);
                this.setState({ metadataSearchItemId: null });
              },
            } as any)}
          />
        )}

        <div className="admin-section-title">
          <Trans>Bulk upload</Trans>
        </div>
        <label className="admin-file-label">
          <Trans>Add book files</Trans>
          <input type="file" multiple onChange={this.handleFilesSelected} />
        </label>

        {items.length > 0 && (
          <>
            <div className="admin-table-wrapper" style={{ marginTop: 16 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>
                      <Trans>Title</Trans>
                    </th>
                    <th>
                      <Trans>Author</Trans>
                    </th>
                    <th>
                      <Trans>File</Trans>
                    </th>
                    <th>
                      <Trans>Status</Trans>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const locked = item.status === "uploading" || item.status === "done";
                    const previewSrc = item.coverObjectUrl || item.coverUrl;
                    return (
                      <tr key={item.id}>
                        <td>
                          <label
                            className="admin-bulk-cover-cell"
                            title={t("Click to select image")}
                          >
                            {previewSrc ? (
                              <img
                                src={previewSrc}
                                alt=""
                                className="admin-bulk-cover-thumb"
                              />
                            ) : (
                              <span className="admin-bulk-cover-placeholder">—</span>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              disabled={locked}
                              onChange={(e) => this.handleManualCover(item.id, e)}
                            />
                          </label>
                        </td>
                        <td>
                          <input
                            className="admin-bulk-input"
                            value={item.title}
                            disabled={locked}
                            onChange={(e) => this.updateItem(item.id, { title: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="admin-bulk-input"
                            value={item.author}
                            disabled={locked}
                            onChange={(e) => this.updateItem(item.id, { author: e.target.value })}
                          />
                        </td>
                        <td className="admin-bulk-filename" title={item.file.name}>
                          {item.file.name}
                        </td>
                        <td>
                          {item.isExtracting ? (
                            <span className="admin-bulk-status">
                              <Trans>Detecting title, author and cover from the book file...</Trans>
                            </span>
                          ) : item.status === "uploading" ? (
                            <span className="admin-bulk-status">{t("Uploading...")}</span>
                          ) : item.status === "done" ? (
                            <span className="admin-bulk-status admin-bulk-status-done">
                              {t("Uploaded")}
                            </span>
                          ) : item.status === "error" ? (
                            <span
                              className="admin-bulk-status admin-bulk-status-error"
                              title={item.error || ""}
                            >
                              {t("Failed")}
                            </span>
                          ) : (
                            <span className="admin-bulk-status">{t("Ready")}</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              className="admin-secondary-btn"
                              disabled={locked}
                              onClick={() => this.setState({ metadataSearchItemId: item.id })}
                            >
                              {t("Get metadata")}
                            </button>
                            <button
                              type="button"
                              className="admin-danger-btn"
                              disabled={item.status === "uploading"}
                              onClick={() => this.handleRemove(item.id)}
                            >
                              {t("Remove")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="admin-bulk-actions">
              <button
                type="button"
                className="admin-primary-btn"
                disabled={isUploading || pendingCount === 0}
                onClick={this.handleUploadAll}
              >
                {isUploading ? t("Uploading...") : `${t("Upload all")} (${pendingCount})`}
              </button>
              {doneCount > 0 && (
                <button
                  type="button"
                  className="admin-secondary-btn"
                  onClick={this.handleClearUploaded}
                >
                  <Trans>Clear uploaded</Trans>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }
}

export default BulkUpload;
