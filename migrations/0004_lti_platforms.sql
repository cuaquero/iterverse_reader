-- LTI 1.3 platform registrations (one row per Canvas instance/registration).
-- Populated by Dynamic Registration (functions/api/lti/register.ts), not
-- hand-edited. deployment_id is nullable because Dynamic Registration alone
-- doesn't guarantee one -- Canvas may only confirm it on the first launch.
CREATE TABLE lti_platforms (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  deployment_id TEXT,
  auth_login_url TEXT NOT NULL,
  auth_token_url TEXT NOT NULL,
  jwks_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_lti_platforms_issuer_client ON lti_platforms(issuer, client_id);
