// Secrets are set via `wrangler pages secret put <NAME>` and don't appear in
// wrangler.jsonc, so declare them here to extend the generated Env interface
// (worker-configuration.d.ts) via TypeScript's interface merging.
interface Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  APP_BASE_URL?: string; // e.g. https://books.itstem.org — falls back to request origin if unset
  // This tool's own RS256 keypair, published at /api/lti/jwks. Required by the
  // LTI Dynamic Registration spec even though plain login/launch never uses
  // it -- only needed later if grade passback/roster sync (LTI Advantage
  // services) are added, since those sign the tool's own service-call
  // assertions with the private half. Generate once; see LTI.md.
  LTI_TOOL_PUBLIC_JWK?: string; // JSON-encoded public JWK
  LTI_TOOL_PRIVATE_KEY?: string; // PKCS8 PEM, kept secret
}
