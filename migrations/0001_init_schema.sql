-- Users: one row per BTECH account (Google/Microsoft OAuth) that has signed in.
-- Access control is enforced at OAuth-callback time (email must end in @btech.edu),
-- not by anything in this table.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  oauth_provider TEXT NOT NULL, -- 'google' | 'microsoft'
  oauth_sub TEXT NOT NULL,      -- provider's stable subject id, for account matching
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
CREATE UNIQUE INDEX idx_users_provider_sub ON users(oauth_provider, oauth_sub);

-- Generic per-user key/value store, one row per (user, dbName), mirroring the
-- client's existing DatabaseService contract 1:1: every dbName ("book",
-- "bookmark", "note", "highlight", etc.) is a JSON array of records, replaced
-- wholesale on every write (matching the current localforage fallback's
-- semantics exactly). This means the client-side storage abstraction only
-- needs its two primitive methods (getAllRecords/saveAllRecords) repointed
-- at this API -- every other DatabaseService method is already built on top
-- of those two and needs no changes.
--
-- Known limitation: D1 rows cap at 1MB, so a very large personal library's
-- "book" blob could theoretically hit that ceiling. Fine for a first cut;
-- revisit with a real per-record schema if it becomes a problem in practice.
CREATE TABLE kv_store (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  db_name TEXT NOT NULL,
  data TEXT NOT NULL, -- JSON-serialized array of records
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, db_name)
);
