# BTECH Reader — Cloudflare Backend

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
| Pages project | `btech-books` | — |
| Custom domain | `books.itstem.org` | — |
| D1 database | `btech-books` | `f4b2281b-2359-40c4-9af2-4efdd6eb3c92` |
| R2 bucket | `btech-books-files` | — |
| KV namespace | `btech_books_sessions` | `a336b3af69344eed8aaee5ad3d54574c` |

Config lives in `wrangler.jsonc` at the repo root. Bindings there:
`DB` (D1), `BOOK_FILES` (R2), `SESSIONS` (KV), plus the `ALLOWED_EMAIL_DOMAIN`
var (`btech.edu`).

## Current status: gated behind a placeholder

**`functions/_middleware.ts` currently intercepts every request that isn't
under `/api/` and returns a small "under construction" page instead of the
real app.** This is intentional and temporary — the real static build is
already deployed underneath it, but nothing requires login yet on the client
side, so the working-looking app shouldn't be publicly browsable until auth is
actually wired up. **Delete that file once the client-side wiring
(below) is done and the app is ready to go live.**

`/api/*` routes are NOT gated by the placeholder — they're live and testable
right now via curl/scripts even while the placeholder is up.

## Auth: Google & Microsoft OAuth, restricted to @btech.edu

The plan is to reuse Koodo's existing Google/Microsoft login buttons
(`src/pages/login/`) rather than build a new login UI — just repoint them at
these routes instead of Koodo's own backend. **That client-side repointing
has NOT been done yet** — it's on hold pending BTECH's approval to register
the OAuth apps (see below). The backend side is fully built and deployed.

### Required secrets (not set yet)

Whoever registers the OAuth apps needs to hand over a client ID + secret for
each provider you want to support. Set them with:

```bash
echo "<value>" | npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name=btech-books
echo "<value>" | npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=btech-books
echo "<value>" | npx wrangler pages secret put MICROSOFT_CLIENT_ID --project-name=btech-books
echo "<value>" | npx wrangler pages secret put MICROSOFT_CLIENT_SECRET --project-name=btech-books
```

Each provider's routes 501 cleanly ("... isn't configured yet") until its
secrets are set — you can support just one provider first if that's faster to
get approved.

### What to register, on each provider's side

**Google** — OAuth 2.0 Client ID, type "Web application", in Google Cloud
Console, under whatever project BTECH's Google Workspace admin manages:
- Authorized redirect URI: `https://books.itstem.org/api/auth/google/callback`

**Microsoft** — App registration in Entra ID (Azure AD):
- Redirect URI: `https://books.itstem.org/api/auth/microsoft/callback`
- Supported account types: "Accounts in this organizational directory only"
  (single tenant) — the code requests Microsoft's `organizations` endpoint,
  which already excludes personal Microsoft accounts

### Why @btech.edu restriction is enforced server-side, not just via Google's `hd` hint

The Google login-initiation route sets `hd=btech.edu`, which biases Google's
account chooser toward the school domain, but that's a UX hint, not a security
boundary — a user could still complete sign-in with a different account in
some flows. Both callback routes (`functions/api/auth/*/callback.ts`)
independently re-check the verified email domain from the ID token returned
directly by Google/Microsoft's own token endpoint (a server-to-server call
authenticated with the client secret) before creating a session. Don't
loosen that check without understanding why it's there twice.

### Sessions

12-hour TTL, stored in KV, set as an `HttpOnly; Secure; SameSite=Lax` cookie.
Deliberately short: this app has no account-deactivation mechanism of its own,
so "access only while enrolled" is enforced by forcing periodic re-auth against
BTECH's own Google/Microsoft directory — a suspended school account simply
can't complete OAuth again once its session expires. Don't extend the TTL far
without an alternative way to revoke access.

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

**This is a design assumption, not a confirmed decision** — if BTECH's actual
mental model is per-student uploads, or students "checking out" books from a
larger catalog rather than reading the whole thing, this schema needs
revisiting before the client wires up to it.

Routes:
- `GET /api/books` — list catalog metadata. Any authenticated user.
- `GET /api/books/:id` — one book's metadata. Any authenticated user.
- `POST /api/books` — upload (`multipart/form-data`, fields: `file` required,
  `cover`/`title`/`author` optional). **Admin only** — 403 for students.
- `DELETE /api/books/:id` — remove a book and its R2 objects. **Admin only.**
- `GET /api/books/:id/file` — streams the book file straight from R2 (not a
  presigned URL — keeps the bucket private, no R2 API-token signing to set
  up). Supports `Range` requests since EPUB/PDF readers do partial reads.
- `GET /api/books/:id/cover` — same, for the cover image, if one was uploaded.

### User roles

`users.role` is `'student'` (default) or `'admin'`. Promoting/demoting is
done through the admin UI (`/admin`, Users tab), backed by
`GET /api/admin/users` and `PATCH /api/admin/users/:id` (both admin-only;
self-demotion is blocked to avoid locking out the only admin). The old
manual route still works if the UI is ever unreachable:

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

yarn build
npx wrangler pages dev ./build
```

`wrangler pages dev` reads the bindings from `wrangler.jsonc` automatically.
By default it talks to **local, emulated** D1/R2/KV (empty until you seed
them) — pass `--remote` equivalents or run migrations with `--local` first if
you need real data locally. See the `d1`/`r2`/`kv` sections of the `cloudflare`
skill (or `developers.cloudflare.com`) for specifics; they change often enough
that it's not worth freezing exact flags here.

## Migrations

```bash
npx wrangler d1 migrations create btech-books <name>   # new migration file
npx wrangler d1 migrations apply btech-books --remote  # apply to production
npx wrangler d1 migrations list btech-books --remote   # what's applied
```

Applied so far: `0001_init_schema` (users, kv_store), `0002_add_user_role`
(users.role), `0003_books_catalog` (books).

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
npx wrangler pages deploy ./build --project-name=btech-books --branch=dev
```

## What's NOT done yet

- Client-side: login buttons still point at Koodo's own backend;
  `DatabaseService`'s web branch still uses `localforage` instead of
  `/api/db/:dbName`; nothing in the app actually requires login. All on hold
  pending the OAuth app registrations above.
- The `/admin` page (book upload/removal, role management) isn't linked from
  anywhere in the app yet and isn't reachable without a session cookie — same
  OAuth blocker as everything else client-side. Untested end-to-end against a
  real session; only verified with fixture data so far.
- LTI 1.3 / Canvas integration — backend routes and D1 schema are scaffolded
  (`functions/api/lti/*`, `functions/lib/lti.ts`), but registration with a
  real Canvas instance hasn't happened yet and the session-delivery approach
  is untested against an actual embedded launch. See [LTI.md](./LTI.md) for
  the full design and what's left.
