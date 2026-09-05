# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This repo (koodo-bridge) is a BTECH (Bridgerland Technical College) customization fork of Koodo Reader: a pure web ebook reader (React CRA + Redux), deployed on Cloudflare (`reader.iterverse.net`, migrated from `books.itstem.org` - see ad_labs's `docs/admin-scope.md` for the migration itself). LTI/Canvas embedding is deprioritized indefinitely (BTECH's own call - "unlikely to happen") in favor of the platform auth described below; `LTI.md`'s plan and scaffolding are left in place but not the active direction.

**Product name**: the app is **Iterverse Reader** (renamed from "Bindo", which was itself a rename from "BTECH Reader" - `git log --grep=Bindo` and `--grep=Iterverse` find those commits). It's part of **Iterverse**, BTECH IT's umbrella platform alongside the labs app (`ad_labs` repo) - that repo's `design-system/` folder is the canonical source for the Iterverse mark, wordmark, and brand tokens; `src/components/iterverseMark/` and `src/assets/styles/btech-tokens.css` here are this app's own copies of that same system (the token *variable names* stayed `--btech-*` since ~11 CSS rules already consume them and the actual hex values are identical either way - only the product name and mark changed, not the token naming). "Koodo Reader" branding was left in place anywhere it's tied to real behavior rather than display text: `isEnableKoodoSync`/`KoodoFileSystemDB` (stored user config/IndexedDB names - renaming risks orphaning existing users' data), the literal `KoodoReader` sync-folder convention and the real "Koodo Reader" browser extension (both are genuine third-party interop, not this app's own branding), and the device-limit error message (tied to Koodo's own hosted account system, not yet relevant since BTECH's own backend isn't wired up). The upstream login carousel's mobile-app/Pro-tier marketing steps (originally `currentStep` 0/1/4's content) were stripped rather than relabeled, since this fork has no mobile app or paid tier to advertise - the login flow now starts directly at the real sign-in step.

**Important change**: upstream Koodo Reader is a cross-platform Electron app, but this fork has completely removed Electron packaging — no `main.js`, no native SQLite (better-sqlite3), no desktop installers/IPC channels. All database operations now go through browser-side storage (IndexedDB via `localforage`, or the File System Access API for local-folder sync) — see the non-Electron branch of `src/utils/storage/databaseService.ts`. The code still has plenty of `isElectron` (from `react-device-detect`) branches and `window.require("electron")` calls — these never execute in this fork (`isElectron` is always `false`) and are intentionally-left dead code, not bugs. No need to clean them up unless there's a new reason to bring Electron back.

**Cloudflare backend**: `functions/` holds a set of Pages Functions (OAuth/Access login, a generic sync API keyed by `dbName`, a shared book-catalog API), backed by D1 (`migrations/`), R2, and KV. See **[CLOUDFLARE.md](./CLOUDFLARE.md)** for the full picture — required secrets, local dev, migrations, deployment.

**The client IS wired up to this backend now** (this was the single biggest gap for most of this project's life - if you're reading old context that says otherwise, it's stale). The real, live sign-in path is **`functions/api/auth/access.ts`**, not Google/Microsoft OAuth: it sits behind a Cloudflare Access Application (One-Time PIN, no external app registration needed - see `platform-auth/README.md` in the `ad_labs` repo for the identity model, shared across Iterverse). Google/Microsoft OAuth (`functions/api/auth/google*`, `microsoft*`) are still scaffolded and functional server-side but their client-side entry points are hidden (`src/pages/login/component.tsx`) until BTECH provisions student accounts - don't remove that scaffolding, just don't expect it reachable from the UI. `src/utils/storage/databaseService.ts`'s web-mode methods now call the real backend (`functions/api/db/[dbName].ts`) when signed in, falling back to `localforage` when not (see `src/utils/storage/remoteDb.ts` - this fallback is deliberate, not a bug: Koodo has always allowed fully signed-out use, and a 401 used to mean silent data loss before this fallback existed). `functions/_middleware.ts` (the "under construction" gate) has been **removed** - the app is live for real, not a bug if you don't see it anymore. All four login paths (Access, Google, Microsoft, LTI) also require an active roster entitlement, not just a valid email/domain - `functions/lib/roster.ts` checks the Iterverse roster service before a session is ever created; see CLOUDFLARE.md's "roster entitlement" section for what that means operationally.

**Roles**: `users.role` is `"student"` or `"admin"` (default: student; promoting the *first* admin requires a direct D1 `UPDATE` - there's a bootstrapping chicken-and-egg here since the in-app role-toggle at `/admin` requires already being admin to reach it). Role drives real UI differences, not just permissions: `/manager/home` shows `HomeList` (`src/containers/lists/homeList/`), which renders the student's `Catalog` (`src/pages/catalog/`, browses `GET /api/books`, downloads+imports on click) or the admin's normal personal `BookList`. Personal file import (header's `ImportLocal`, and manager's drag-and-drop) is gated to `role === "admin"` - students can't import their own files by design, only read what an admin has curated via `/admin`. Catalog curation supports one-at-a-time upload, bulk upload (loose files or a whole `Author/Book Title` folder tree - `src/pages/admin/bulkUpload.tsx`), editing an existing entry's title/author/cover after the fact (`src/pages/admin/editBookRow.tsx`, `PATCH /api/books/:id`), and an online metadata lookup (Google Books, Open Library fallback - `/api/admin/metadata-search`) alongside the client-side extraction from the file's own embedded metadata (`src/utils/file/bookMetadataExtractor.ts`) - see CLOUDFLARE.md's "Admin catalog curation" section for how these fit together.

**`ImportLocal` (`src/components/importLocal/`) has a load-bearing side effect students depend on, even though its own UI is admin-only.** Its `componentDidMount` is the *only* place that registers the real book-import/parse pipeline into Redux (`handleImportBookFunc`) - `Catalog`'s "download from the catalog, then open" flow (`src/pages/catalog/component.tsx`) reuses that same registered function, since it has no import pipeline of its own. `ImportLocal` used to be mounted only for `role === "admin"` (reasonable-looking, since it's visually just the personal-import drop target/button) - that silently left every student running with the reducer's no-op default `importBookFunc`, so every catalog book download appeared to succeed but never actually got imported or opened. Fixed by always mounting `ImportLocal` and having *it* return `null` for non-admins instead of gating its mount in the header - don't reintroduce a role check around where `<ImportLocal />` gets rendered without keeping this in mind.

**Settings surface was substantially cut down** from upstream: no Plugins tab, no AI service tab, no "Ask AI"/Translate/AI-Encyclopedia popups, no third-party OAuth account-linking, no third-party cloud-drive sync (Dropbox/WebDAV/etc, all were Pro-gated anyway) - all of it either had no story for a Cloudflare Access + admin-curated-catalog deployment, or (the AI features specifically) would have silently sent real student reading data to Koodo's own unsubscribed cloud AI once `isAuthed` started meaning "real session" instead of "Pro subscriber". Local zip backup/restore and per-book exports (notes/highlights/dictionary history) were kept. If you're looking for one of the removed tabs/features and it's not there, it was a deliberate removal, not something broken - check `git log --oneline` around "Remove AI, plugin marketplace" for the full reasoning.

**A second, separate round of gating hides more of the settings/library surface from students specifically** (role-based, not a removal - admins still have all of it): Settings' "Sync and backup" tab and the header's own Sync icon (both purely about the `defaultSyncOption` cloud-drive mechanism - `syncSetting/component.tsx`'s own comment explains why a student's backup zip would double as an unmanaged export of the whole catalog's book files), plus "More settings"/"TXT parser"/"Text rules" (power-user/device config with no real use for a catalog-only reader). The sidebar's Trash is hidden for students too, and `deleteDialog`'s `isDisableTrashBin` is forced on for them regardless of stored preference - a student has no Trash view to recover/purge from, so "Delete" is immediate and permanent rather than a soft-delete into a bin they'd never see again. All of this is `role === "admin"` checks added directly in each component (`settingDialog/component.tsx`, `containers/header/component.tsx`, `containers/sidebar/component.tsx`, `deleteDialog/component.tsx`), not a config table - grep for `role === "admin"` in those files before assuming a tab/icon that's missing for a student account is a bug.

### Architecture Layers

| Layer | Location | Responsibility |
|---|---|---|
| React app | `src/` | UI, Redux state, book rendering |
| Cloudflare backend | `functions/`, `migrations/`, `wrangler.jsonc` | OAuth login, data sync API, shared book-catalog API (see CLOUDFLARE.md) |
| Reading engine | `src/assets/lib/kookit-extra.min.mjs` | Closed-source ESM — book parsing, SQL statements, sync utilities |
| Go HTTP service | `httpserver/` | Optional KOReader / OPDS integration |

## Important Reminders

**Do not** try to read these files under `src/assets/lib/`:
- `kookit-extra.min.mjs`
- `kookit.min.js`
- `kookit-extra-browser.min.js`

These are obfuscated/minified build artifacts and unreadable. To check the source, read the local source repos directly:
- `D:\Project\kookit`
- `D:\Project\kookit-extra`

### Redux Slices

`book`, `reader`, `manager`, `viewArea`, `backupPage`, `sidebar`, `progressPanel`

Each slice has one file in `src/store/actions/` and one in `src/store/reducers/`.

### Redux State Type

`stateType` is defined in `src/store/index.tsx`; all `mapStateToProps` should use this type.

### Container Pattern

`index.tsx` (Redux connect) → `component.tsx` → `interface.tsx`, under `src/containers/`.

### Page Routes

- `/manager/*` — main UI (library, notes, trash, etc.)
- `/epub`, `/pdf`, `/mobi`, `/txt`, `/md`, etc. — reader, by format
- `/login`, `/stats`, `/redirect`

### Supported Ebook Formats

EPUB, PDF, MOBI, AZW3, AZW, TXT, FB2, CBR/CBZ/CBT/CB7, MD, DOCX, HTML/XML/XHTML/MHTML/HTM

## Common Commands

```bash
# Install dependencies (first time)
yarn

# Dev mode (browser hot reload)
yarn start

# Production build (static files, for Cloudflare Pages etc.)
yarn build

# Run tests
yarn test
```

Deployment, migration, and local-dev commands for the Cloudflare backend (Functions/D1/R2/KV) live in [CLOUDFLARE.md](./CLOUDFLARE.md) — not duplicated here.

## Development Guidelines

- User-visible text must use `react-i18next`'s `t("key")`, never hardcoded
- Avoid TypeScript `any`; define types in `interface.tsx`
- Use the `stateType` type for state (`src/store/index.tsx`)
- Database operations go through `src/utils/storage/databaseService.ts` (browser-side IndexedDB/localforage) — don't introduce new Electron/IPC dependencies
- New i18n keys need to be added to `src/assets/locales/en.json`
- Reader utility functions (`src/utils/reader/`) affect book rendering inside the iframe — regression-test manually after changes
- Never log tokens, passwords, or full book paths at info level

## Project Structure

```
.
├── functions/              # Cloudflare Pages Functions (see CLOUDFLARE.md)
│   ├── api/
│   │   ├── auth/           # access.ts = real live sign-in (Cloudflare Access OTP, roster-gated); google/microsoft = scaffolded, not wired into the UI yet
│   │   ├── db/[dbName].ts  # Generic sync API, mirrors DatabaseService's web branch
│   │   ├── books/          # Shared book-catalog API (list/upload/edit/download; admin-only add/edit/remove)
│   │   └── admin/          # Admin-only: users list/role-toggle, metadata-search (Google Books/Open Library)
│   └── lib/                # Shared helpers (session, oauth, access, roster, auth checks, R2 storage/streaming)
├── migrations/             # D1 database migrations (wrangler d1 migrations)
├── wrangler.jsonc          # Cloudflare Pages config (D1/R2/KV bindings)
├── httpserver/             # Go HTTP service (KOReader/OPDS)
├── public/                 # Static assets + WASM libs (7z, unrar, pdfjs)
├── src/
│   ├── assets/
│   │   ├── lib/            # Reading engine (kookit-extra.min.mjs) + type definitions
│   │   ├── locales/        # Translation JSON (40+ languages)
│   │   ├── styles/         # Global CSS
│   │   └── images/         # Image assets
│   ├── components/         # Reusable UI components
│   ├── constants/          # Constants
│   ├── containers/         # Container components (Redux stateful)
│   │   ├── lists/          # Lists (bookList, cardList, noteList, navList, contentList)
│   │   ├── panels/         # Panels (navigationPanel, operationPanel, progressPanel, settingPanel)
│   │   ├── settings/       # Settings page tabs
│   │   ├── sidebar/        # Sidebar
│   │   └── viewer/         # Book reading view
│   ├── models/             # Data models (Book, Bookmark, Note, HtmlBook, Plugin)
│   ├── pages/              # Page-level components (manager, reader, login, redirect, stats, catalog, admin)
│   ├── router/             # React Router config
│   ├── store/              # Redux (actions + reducers)
│   └── utils/              # Utilities
│       ├── file/           # File operations (bookUtil, coverUtil, fontUtil, sqlUtil, export, backup, restore)
│       ├── reader/         # Reader logic (highlightUtil, noteUtil, styleUtil, ttsUtil, themeUtil, etc.)
│       ├── request/        # HTTP requests
│       └── storage/        # Storage services (databaseService, syncService)
└── scripts/                # i18n tooling (extract-untranslated, merge-translations) + LTI setup (generate-lti-keypair)
```
