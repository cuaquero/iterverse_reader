-- Two user types, per BTECH's requirement: students can read/annotate/bookmark
-- books but not add them; admins curate the library (upload books). The
-- upload-gating logic itself isn't built yet -- this just adds the column now
-- so it doesn't require a throwaway migration later.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student';
