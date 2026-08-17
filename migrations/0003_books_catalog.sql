-- Shared book catalog: ONE collection of book files that every signed-in user
-- (student or admin) can read from. Only admins can add to or remove from it
-- (see role-gating in functions/api/books/*). This is a design assumption
-- worth confirming with BTECH: it models a curated class/library collection,
-- not a per-student personal library where each student uploads their own
-- books. Per-user state (reading progress, bookmarks, notes, highlights)
-- still belongs to (user, book) individually and is unaffected either way --
-- it already lives in kv_store, keyed by user_id.
CREATE TABLE books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,       -- epub, pdf, mobi, azw3, fb2, etc.
  file_key TEXT NOT NULL,     -- R2 object key for the book file
  cover_key TEXT,             -- R2 object key for the cover image, nullable
  file_size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_books_uploaded_by ON books(uploaded_by);
