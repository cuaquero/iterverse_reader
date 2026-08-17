# Canvas LTI 1.3 Authentication

This documents the plan (and the scaffolding already in the repo) for signing students into the reader via a Canvas LTI 1.3 launch, instead of the Google/Microsoft OAuth flows described in [CLOUDFLARE.md](./CLOUDFLARE.md). It's a near-term priority because BTECH's Microsoft 365 student accounts won't be provisioned for a while, so the Microsoft OAuth entry path is on hold; Canvas access is available sooner.

This long-term plan is still to have both: LTI for the embedded-in-Canvas case, Google/Microsoft OAuth for signing in directly at `books.itstem.org`. Both are designed to resolve to the same `users` row per person (see "Identity" below).

## Status

Backend routes and D1 schema are scaffolded and follow the existing OAuth code's conventions closely, but nothing here has been exercised against a real Canvas instance yet. Before this can work end-to-end:

1. A BTECH Canvas admin needs to register the tool (see "Registration" below) — this can't happen without their involvement.
2. `LTI_TOOL_PUBLIC_JWK` / `LTI_TOOL_PRIVATE_KEY` need to be generated once and set as secrets (see "Tool keypair" below).
3. Migration `0004_lti_platforms.sql` needs to be applied (`npx wrangler d1 migrations apply btech-books --remote`, per CLOUDFLARE.md).
4. `functions/_middleware.ts` still gates every non-`/api/*` route behind the "under construction" page — the LTI bridge page (`/lti/bridge`, served under `/`) is caught by this too, same as the rest of the app. It needs to come down before any real launch can complete, exactly like the Google/Microsoft flows.
5. The cookie/iframe handling below (see "Session delivery") is a best-effort design, not something verified against real browser behavior inside an actual Canvas course yet. Treat it as the first thing to test once a real Canvas sandbox is available.

## Identity: shared with Google/Microsoft OAuth

`functions/lib/users.ts`'s `upsertUser` now matches an incoming login by `(oauth_provider, oauth_sub)` first (unchanged from before), then falls back to matching by `email` if no provider match is found — linking the login to the existing account instead of colliding with the `users.email` UNIQUE constraint. This means a student who launches via Canvas LTI today and signs in with Microsoft 365 later (once BTECH provisions those accounts) ends up as the same `users` row, with `oauth_provider`/`oauth_sub` simply reflecting whichever method they used most recently.

This is a deliberate change from the original comment in that file, which favored matching by provider subject id alone because emails can theoretically be reassigned to a different person. That risk is accepted here because BTECH email addresses aren't expected to be recycled to a different person, and one account per person across login methods is worth more than that edge-case protection.

Every LTI launch is provisioned as `role = 'student'`, regardless of the Canvas role in the launch claims (Instructor included). `admin` in this app means catalog/book management, a deliberate promotion via the `/admin` UI — not something a Canvas course role should hand out automatically. Canvas instructors who need admin access get promoted the same manual way any other admin does.

## Registration: LTI Dynamic Registration

Rather than hand-entering a `client_id`/`deployment_id` BTECH's Canvas admin looks up somewhere, the tool supports [LTI Dynamic Registration](https://www.imsglobal.org/spec/lti-dr/v1p0/): a Canvas admin opens one URL from Canvas's Developer Keys page, and the tool self-registers.

- **`GET /api/lti/register`** (`functions/api/lti/register.ts`) — Canvas opens this with `?openid_configuration=<url>&registration_token=<token>`. The handler fetches Canvas's own OpenID configuration, POSTs a description of this tool (redirect URIs, `initiate_login_uri`, `jwks_uri`) to Canvas's `registration_endpoint` using the token as bearer auth, and stores the resulting `issuer`/`client_id`/endpoints as a row in `lti_platforms`. It ends with the spec-required page that `postMessage`s Canvas's popup to close itself.
- **`GET /api/lti/jwks`** (`functions/api/lti/jwks.ts`) — publishes this tool's own public key, required by the registration spec even though the plain login/launch flow below never reads it. It only matters if grade passback or roster sync (LTI Advantage services) get added later, since those would sign the tool's own service-call requests with the matching private key.

### Tool keypair

Dynamic Registration requires the tool to have its own RS256 keypair. Generate one once with:

```bash
node scripts/generate-lti-keypair.js
```

This prints a PKCS8 PEM and a JSON JWK, and the two `wrangler pages secret put` commands to store them:

```bash
npx wrangler pages secret put LTI_TOOL_PRIVATE_KEY --project-name=btech-books   # PKCS8 PEM
npx wrangler pages secret put LTI_TOOL_PUBLIC_JWK --project-name=btech-books    # JSON-encoded public JWK
```

`LTI_TOOL_PRIVATE_KEY` isn't consumed by any code yet — it's a placeholder for whenever LTI Advantage services are added — but `LTI_TOOL_PUBLIC_JWK` needs to exist for `/api/lti/jwks` to respond, which registration checks.

## Login + launch flow

1. **`GET/POST /api/lti/login`** (`functions/api/lti/login.ts`) — Canvas navigates the tool's placement here first, with `iss`, `client_id`, `login_hint`, `target_link_uri`. The handler looks up the matching `lti_platforms` row, generates a `state`+`nonce` pair, stores them server-side (see "Login state" below), and redirects to Canvas's own authorization endpoint.
2. Canvas authenticates the user itself and redirects back with an `id_token`.
3. **`POST /api/lti/launch`** (`functions/api/lti/launch.ts`) — verifies the `id_token`'s signature against Canvas's JWKS (`functions/lib/lti.ts#verifyLtiLaunch`), checks `nonce`/`aud`/`iss`/`exp`, then extracts `email`/`name`/`sub`/roles/context claims. Upserts the user, creates a session (same `createSession` as the OAuth flows), and hands off into the app (see "Session delivery" below).

### Deployment pinning

A single `client_id`/`issuer` registration can technically cover more than one Canvas deployment (e.g. a multi-campus instance sharing one Developer Key), so accepting any launch that matches the registration alone is broader than intended. `functions/lib/lti.ts#checkOrPinDeployment` pins `lti_platforms.deployment_id` to whatever the first launch's `deployment_id` claim says, then rejects (403) any later launch under that registration whose claim doesn't match.

### Login state, not a cookie

The Google/Microsoft flows verify their `state` parameter against a cookie (`functions/lib/oauth.ts`). LTI can't do that reliably: the login round trip happens inside Canvas's iframe, so a cookie set by `/api/lti/login` is a third-party cookie by the time `/api/lti/launch` tries to read it back — unreliable under Safari ITP and Chrome's third-party-cookie phase-out regardless of `SameSite` value. Instead, `functions/lib/lti.ts` stores `state`+`nonce` server-side in the existing `SESSIONS` KV namespace, keyed by the `state` value itself, and deletes the entry the first time it's read (`consumeLtiLoginState`) so a captured `state` can't be replayed.

### Signature verification is required here (unlike OAuth)

`functions/lib/oauth.ts`'s `decodeJwtPayload` trusts the Google/Microsoft `id_token` without checking its signature, because it only ever comes from a direct server-to-server HTTPS call to the provider's own token endpoint. An LTI `id_token` arrives over a browser redirect instead, so `functions/lib/lti.ts#verifyLtiLaunch` fetches Canvas's JWKS (cached in KV for an hour) and verifies the RS256 signature with WebCrypto before trusting anything in the payload.

## Session delivery: the iframe problem

Canvas embeds the tool in an iframe. From the browser's perspective, any cookie this app's origin tries to set while running inside that iframe is a third-party cookie — Safari blocks these by default (ITP), and Chrome is phasing out third-party cookies generally. This applies even to a normal same-origin `fetch` made by JS running inside the iframe's own document; party status is based on the top-level frame's site, not who made the request. So `/api/lti/launch` doesn't try to set the session cookie directly. Instead:

1. `launch.ts` creates the session (same KV-backed session as everything else, via `createSession`) and generates a single-use, 60-second-TTL handoff code (`createLtiHandoff`) mapped to that session id.
2. It redirects to `{base}/#/lti/bridge?code=<handoff>`. Note this is a URL **fragment** (after the `#`) — because the app uses `HashRouter` (`src/router/index.tsx`), everything after the first `#` is client-side routing state, so the code is never sent to the server in this redirect and won't appear in server access logs.
3. `src/pages/ltiBridge` reads `code` from `location.search` (react-router parses the part after `#/lti/bridge` as its own path+query), `fetch`es `POST /api/lti/exchange` with it, and gets back the session id.
4. The exchange response is stored via `src/utils/storage/ltiSession.ts` in `localStorage`, not a cookie — storage isn't subject to the same third-party-cookie blocking (at least not universally, today).

**This is the part most likely to need rework once tested against a real Canvas course.** `localStorage` inside a third-party iframe is on a shakier long-term footing than first-party storage (some browsers apply storage partitioning too), and this hasn't been tried against Safari specifically. If it turns out to be unreliable, the fallback is the Storage Access API or a full top-level-navigation "confirm to continue" step, both of which add a user-facing click.

### The other half: nothing reads the token yet

`src/utils/storage/ltiSession.ts` stores the session id but nothing currently sends it anywhere — per [CLAUDE.md](./CLAUDE.md), the client isn't wired up to this Cloudflare backend at all yet (it still talks to Koodo's own backend and uses `localforage`). `functions/lib/session.ts#getSessionUser` already accepts the session id as an `Authorization: Bearer <token>` header as a fallback to the cookie, so once the client is switched over to this backend, its request layer needs to attach that header (reading from `getLtiSessionToken()`) whenever it's present, alongside the existing cookie-based path for Google/Microsoft logins.

## Schema

`migrations/0004_lti_platforms.sql` adds:

```sql
CREATE TABLE lti_platforms (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  deployment_id TEXT,          -- nullable; Dynamic Registration alone doesn't guarantee this
  auth_login_url TEXT NOT NULL,
  auth_token_url TEXT NOT NULL,
  jwks_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_lti_platforms_issuer_client ON lti_platforms(issuer, client_id);
```

`users.oauth_provider` needed no schema change (it's a plain `TEXT` column, no `CHECK` constraint) — `"lti"` is just a new value alongside `"google"`/`"microsoft"` in `functions/lib/users.ts`'s `OAuthIdentity` type.

## Open follow-ups

- Test the session-delivery bridge against a real Canvas sandbox course, specifically in Safari.
- If grade passback or roster sync (NRPS) ever get added, that's where `LTI_TOOL_PRIVATE_KEY` and a `client_credentials` token endpoint come into play — nothing here needs it yet.
