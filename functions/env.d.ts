// Secrets are set via `wrangler pages secret put <NAME>` and don't appear in
// wrangler.jsonc, so declare them here to extend the generated Env interface
// (worker-configuration.d.ts) via TypeScript's interface merging.
interface Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  APP_BASE_URL?: string; // e.g. https://books.itstem.org — falls back to request origin if unset
}
