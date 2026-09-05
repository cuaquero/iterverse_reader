# Iterverse Reader — Cloudflare Backend

This document covers the Cloudflare Pages + Functions backend added on top of the
Koodo Reader web build for BTECH's deployment. It's aimed at whoever ends up
operating this (BTECH IT) as much as at a future Claude Code session — if
you're neither, the short version is: static app on Cloudflare Pages, a handful
of Pages Functions for auth and data sync, D1 for structured data, R2 for book
files, KV for sessions.

## Cloudflare resources

All of this lives in the **Bridgerland IT Department** Cloudflare account
(account id `69184173ed176c25aa8d34f4206b0864`), the same account that runs
`btech-ticketing` and `emu-print`.

| Resource | Name | ID |
|---|---|---|
| Pages project | `iterverse-reader` | — |
| Custom domain | `reader.iterverse.net` | — |
| D1 database | `btech-books` | `f4b2281b-2359-40c4-9af2-4efdd6eb3c92` |
| R2 bucket | `btech-books-files` | — |
| KV namespace | `btech_books_sessions` | `a336b3af69344eed8aaee5ad3d54574c` |

The Pages project and domain were renamed/migrated from `btech-books` /
`books.itstem.org` as part of folding this app into the broader Iterverse
platform — see `ad_labs`' `docs/admin-scope.md` for the full migration
writeup. The D1/R2/KV resource *names* weren't renamed along with it (they're
bound by id/name in `wrangler.jsonc`, not by the Pages project name), so
`btech-*` naming still shows up throughout this doc and the codebase — that's
expected, not a leftover to clean up. `wrangler.jsonc`'s own top-level `name`
field still says `btech-books` too; it's cosmetic (a local label for
`wrangler pages dev`), not the source of truth for which Pages project a
deploy targets — that's the `--project-name` flag, `iterverse-reader` below.

Config lives in `wrangler.jsonc` at the repo root. Bindings there:
`DB` (D1), `BOOK_FILES` (R2), `SESSIONS` (KV), plus vars
`ALLOWED_EMAIL_DOMAIN` (`btech.edu`), `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and
`ROSTER_API_URL`.

## Current status: live

The app is live and requires sign-in — there is no placeholder/under-construction
gate anymore (`functions/_middleware.ts` was removed once the client was
actually wired up to this backend). `/manager/*` and every other client route
now goes through a real auth check; signing out or having no session redirects
to `/login`.

## Auth: three login paths, all gated on roster entitlement

There are three ways to get a session, all converging on the same
`users` table and the same session mechanism (`functions/lib/session.ts`):

| Path | Status | Route |
|---|---|---|
| Cloudflare Access (OTP) | **Live — the real sign-in path today** | `functions/api/auth/access.ts` |
| Google / Microsoft OAuth | Built, roster-gated, hidden client-side | `functions/api/auth/google*`, `microsoft*` |
| Canvas LTI 1.3 | Scaffolded, deprioritized indefinitely (BTECH's call) | `functions/api/lti/*` — see [LTI.md](./LTI.md) |

### Live path: Cloudflare Access (One-Time PIN)

Reader sits behind a Cloudflare Access Application (`ACCESS_TEAM_DOMAIN`,
`ACCESS_AUD` in `wrangler.jsonc`'s `vars` — not secret, just identifiers) —
the same identity model the `ad_labs` labs app uses for its own enrollment,
documented in that repo's `platform-auth/README.md`. Hitting
`/api/auth/access` (a real top-level `<a href>`, not a fetch — Access needs to
intercept the navigation) makes Access run its OTP challenge, then hands the
request to `functions/api/auth/access.ts` with a signed
`Cf-Access-Jwt-Assertion` header, which the Function verifies
(`functions/lib/access.ts`) before trusting the email. There's deliberately
no `@btech.edu` domain check on this path — see "Why the domain check differs
by path" below.

### Every path checks the Iterverse roster service, not just a domain

As of 2026-09, having a valid school email isn't enough on its own — Reader
also requires an active enrollment in *any* course, checked against the
Iterverse roster service (`iterverse_hub`), per the entitlement rule in
`ad_labs/docs/unified-identity-v2-draft.md`: "any active enrollment anywhere"
implies Reader access, not a per-course grant. `functions/lib/roster.ts`'s
`checkRosterEntitlement(env, email)` POSTs `{ email, product: "reader" }` to
`${ROSTER_API_URL}/api/entitlement/check` with a bearer `ROSTER_SERVICE_KEY`
(a secret shared with the roster service's own `SERVICE_KEY`); a non-`entitled`
response redirects to `/#/no-access` (`src/pages/no-access/`) instead of
creating a session. All four login callbacks (Access, Google, Microsoft, LTI)
call this — it was originally only on the Access path and got backfilled onto
the other three in a security-audit pass so a future OAuth/LTI rollout
couldn't silently skip it.

**Operationally, this means the roster service's data is now a hard
dependency for sign-in** — an otherwise-legitimate BTECH account with no
enrollment record in `iterverse_hub` gets bounced to `/no-access`. If real
users report being locked out, check the roster's data first; it's a
different repo/service from this one.

### Google & Microsoft OAuth (built, not yet activated)

The backend is fully built, deployed, and roster-gated identically to the
Access path — but the client-side entry points are hidden
(`{false && ...}` around `loginList` in `src/pages/login/component.tsx`)
because there's no real UI for it to point to yet: BTECH hasn't provisioned
student Google/Microsoft accounts. Nothing else is blocking this — flip that
condition and set the secrets below once accounts exist.

#### Required secrets (not set yet)

```bash
echo "<value>" | npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name=iterverse-reader
echo "<value>" | npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=iterverse-reader
echo "<value>" | npx wrangler pages secret put MICROSOFT_CLIENT_ID --project-name=iterverse-reader
echo "<value>" | npx wrangler pages secret put MICROSOFT_CLIENT_SECRET --project-name=iterverse-reader
```

Each provider's routes 501 cleanly ("... isn't configured yet") until its
secrets are set — you can support just one provider first if that's faster to
get approved.

#### What to register, on each provider's side

**Google** — OAuth 2.0 Client ID, type "Web application", in Google Cloud
Console, under whatever project BTECH's Google Workspace admin manages:
- Authorized redirect URI: `https://reader.iterverse.net/api/auth/google/callback`

**Microsoft** — App registration in Entra ID (Azure AD):
- Redirect URI: `https://reader.iterverse.net/api/auth/microsoft/callback`
- Supported account types: "Accounts in this organizational directory only"
  (single tenant) — the code requests Microsoft's `organizations` endpoint,
  which already excludes personal Microsoft accounts

### Why the domain check differs by path

The Google/Microsoft callbacks (`functions/api/auth/*/callback.ts`)
independently re-check the verified email domain from the ID token returned
directly by Google/Microsoft's own token endpoint (a server-to-server call
authenticated with the client secret) against `ALLOWED_EMAIL_DOMAIN`, in
addition to `hd=btech.edu` on the Google login-initiation route (a UX hint
only, not a security boundary — don't rely on it alone). The Access OTP path
has no equivalent domain check by design: it's platform auth for whoever OTP
verified control of an email for, mirroring `ad_labs`' own `enroll.ts` model,
not a school-tenant login — the roster entitlement check above is what gates
it instead. Don't add a domain check to the Access path expecting it to
behave like the OAuth ones; it's a different trust model on purpose.

### Sessions

12-hour TTL, stored in KV, set as an `HttpOnly; Secure; SameSite=Lax` cookie.
For Google/Microsoft, this is deliberately short because a deactivated school
account can't complete OAuth again once its session expires — periodic
re-auth against BTECH's own directory *is* the revocation mechanism, since
this app has no account-deactivation of its own. **That property does not
carry over to Access OTP**: OTP alone just proves someone controls a given
email address, not that they still should have access — for that path,
revocation is entirely down to the roster check re-running (roster
entitlement is only checked at sign-in, not on every request) and the Access
Application's own policy staying current. See `unified-access-vision.md` in
`ad_labs` for the still-open platform-wide revocation question. Don't extend
`SESSION_TTL_SECONDS` far without accounting for this gap.

## Data model

### Generic per-user sync (`kv_store` table)

Mirrors `DatabaseService`'s existing web-fallback contract from the Koodo
codebase exactly: one row per `(user, dbName)`, where `dbName` is `"book"`,
`"bookmark"`, `"note"`, etc., and `data` is the JSON-serialized array of
records for that name — the whole array is replaced on every write, same as
the `localforage` fallback it replaces. See
`migrations/0001_init_schema.sql` for the schema and code comments for why
this shape needs no client-side rewrite beyond two methods.

Routes: `GET|PUT|DELETE /api/db/:dbName`, all session-gated.

**Known limit:** D1 rows cap at 1MB. A very large personal dataset under one
`dbName` could theoretically hit that. Not a regression from the current
behavior — just worth knowing.

### Shared book catalog (`books` table)

Per BTECH's requirement that students can read/annotate/bookmark books but
not add them, this models **one shared catalog** every signed-in user reads
from — not a per-student personal library. See
`migrations/0003_books_catalog.sql`.

Routes:
- `GET /api/books` — list catalog metadata. Any authenticated user.
- `GET /api/books/:id` — one book's metadata. Any authenticated user.
- `POST /api/books` — upload (`multipart/form-data`, fields: `file` required,
  `cover`/`title`/`author` optional). **Admin only** — 403 for students.
  Content-Type stored in R2 is derived from a hardcoded file-extension map,
  not trusted from the upload — a past security-audit fix, don't revert to
  trusting `file.type`.
- `DELETE /api/books/:id` — remove a book and its R2 objects. **Admin only.**
- `GET /api/books/:id/file` — streams the book file straight from R2 (not a
  presigned URL — keeps the bucket private, no R2 API-token signing to set
  up). Supports `Range` requests since EPUB/PDF readers do partial reads.
- `GET /api/books/:id/cover` — same, for the cover image, if one was uploaded.

### User roles

`users.role` is `'student'` (default) or `'admin'`. Promoting/demoting is
done through the admin UI (`/admin`, linked from the header for admins,
Users tab), backed by `GET /api/admin/users` and `PATCH /api/admin/users/:id`
(both admin-only; self-demotion is blocked to avoid locking out the only
admin). The old manual route still works if the UI is ever unreachable:

```bash
npx wrangler d1 execute btech-books --remote \
  --command="UPDATE users SET role = 'admin' WHERE email = 'someone@btech.edu'"
```

(Requires that person to have signed in at least once already, since the
`users` row is created on first login.)

## Local development

```bash
# One-time
npm install -D wrangler   # or use npx wrangler as shown throughout

# Secrets for local dev only — create .dev.vars (gitignored), NOT committed:
#   GOOGLE_CLIENT_ID=...
#   GOOGLE_CLIENT_SECRET=...
#   MICROSOFT_CLIENT_ID=...
#   MICROSOFT_CLIENT_SECRET=...
#   ROSTER_SERVICE_KEY=...

yarn build
npx wrangler pages dev ./build
```

`wrangler pages dev` reads the bindings and non-secret `vars` (including
`ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`/`ROSTER_API_URL`) from `wrangler.jsonc`
automatically. By default it talks to **local, emulated** D1/R2/KV (empty
until you seed them) — pass `--remote` equivalents or run migrations with
`--local` first if you need real data locally. Note that the Access OTP path
can't really be exercised locally (there's no local equivalent of the Access
challenge), and the roster check will fail closed against a real
`ROSTER_API_URL` unless your test email actually has an enrollment there — See
the `d1`/`r2`/`kv` sections of the `cloudflare` skill (or
`developers.cloudflare.com`) for specifics; they change often enough that
it's not worth freezing exact flags here.

## Migrations

```bash
npx wrangler d1 migrations create btech-books <name>   # new migration file
npx wrangler d1 migrations apply btech-books --remote  # apply to production
npx wrangler d1 migrations list btech-books --remote   # what's applied
```

Applied so far: `0001_init_schema` (users, kv_store), `0002_add_user_role`
(users.role), `0003_books_catalog` (books). `0004_lti_platforms` exists in
the repo but is **not yet applied** — it's part of the LTI onboarding
sequence in [LTI.md](./LTI.md), on hold along with the rest of that work.

## Deployment

**Auto-deploy is wired up**: the Pages project is connected directly to
`mfoster-stem/koodo-bridge` (Cloudflare's own Git integration, not a GitHub
Action), production branch `dev`, automatic deployments enabled. Push to
`dev` and Cloudflare builds and deploys it — no separate CI needed.

This depends on one dashboard-only setting that **isn't stored in this repo
and can't be checked into it**: Pages project → Settings → Build →
**Build command = `yarn build`**. Without it, Cloudflare skips the build
step entirely, can't find the `build/` output directory `wrangler.jsonc`
points at, and every push-triggered deploy fails with "Output directory
not found" — which is exactly what happened the first time this was wired
up. If auto-deploy mysteriously stops working after a dashboard change,
check that setting first.

Manual deploy still works if you need to push something outside of a
`dev` commit (e.g. testing a branch, or bypassing a broken auto-deploy):

```bash
yarn build
npx wrangler pages deploy ./build --project-name=iterverse-reader --branch=dev
```

## What's NOT done yet

- **Google/Microsoft OAuth activation** — backend complete and roster-gated;
  purely waiting on BTECH provisioning real student Google/Microsoft
  accounts, then setting the secrets above and un-hiding the client-side
  buttons. No further code work expected.
- **Canvas LTI 1.3** — backend routes and D1 schema are scaffolded
  (`functions/api/lti/*`, `functions/lib/lti.ts`), migration not yet applied,
  registration with a real Canvas instance hasn't happened. BTECH has called
  this deprioritized indefinitely ("unlikely to happen") in favor of the
  Access/roster model above — treat [LTI.md](./LTI.md) as historical design
  reference, not an active near-term task, unless that changes.
- **Roster data completeness** — this is the live path's actual dependency
  now (see "roster entitlement" above), and it lives in a different
  repo/service (`iterverse_hub`, part of `ad_labs`). If sign-ins are failing
  for real, otherwise-legitimate users, check there first.
