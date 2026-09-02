# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This repo (koodo-bridge) is a BTECH (Bridgerland Technical College) customization fork of Koodo Reader: a pure web ebook reader (React CRA + Redux), deployed on Cloudflare (`books.itstem.org`), with plans to embed it in Canvas LMS via LTI (not started yet).

**Product name**: the app is **Iterverse Reader** (renamed from "Bindo", which was itself a rename from "BTECH Reader" - `git log --grep=Bindo` and `--grep=Iterverse` find those commits). It's part of **Iterverse**, BTECH IT's umbrella platform alongside the labs app (`ad_labs` repo) - that repo's `design-system/` folder is the canonical source for the Iterverse mark, wordmark, and brand tokens; `src/components/iterverseMark/` and `src/assets/styles/btech-tokens.css` here are this app's own copies of that same system (the token *variable names* stayed `--btech-*` since ~11 CSS rules already consume them and the actual hex values are identical either way - only the product name and mark changed, not the token naming). "Koodo Reader" branding was left in place anywhere it's tied to real behavior rather than display text: `isEnableKoodoSync`/`KoodoFileSystemDB` (stored user config/IndexedDB names - renaming risks orphaning existing users' data), the literal `KoodoReader` sync-folder convention and the real "Koodo Reader" browser extension (both are genuine third-party interop, not this app's own branding), and the device-limit error message (tied to Koodo's own hosted account system, not yet relevant since BTECH's own backend isn't wired up). The upstream login carousel's mobile-app/Pro-tier marketing steps (originally `currentStep` 0/1/4's content) were stripped rather than relabeled, since this fork has no mobile app or paid tier to advertise - the login flow now starts directly at the real sign-in step.

**Important change**: upstream Koodo Reader is a cross-platform Electron app, but this fork has completely removed Electron packaging — no `main.js`, no native SQLite (better-sqlite3), no desktop installers/IPC channels. All database operations now go through browser-side storage (IndexedDB via `localforage`, or the File System Access API for local-folder sync) — see the non-Electron branch of `src/utils/storage/databaseService.ts`. The code still has plenty of `isElectron` (from `react-device-detect`) branches and `window.require("electron")` calls — these never execute in this fork (`isElectron` is always `false`) and are intentionally-left dead code, not bugs. No need to clean them up unless there's a new reason to bring Electron back.

**Cloudflare backend**: `functions/` holds a set of Pages Functions (Google/Microsoft OAuth login, a generic sync API keyed by `dbName`, a shared book-catalog API), backed by D1 (`migrations/`), R2, and KV. See **[CLOUDFLARE.md](./CLOUDFLARE.md)** for the full picture — required secrets, local dev, migrations, deployment. **The client isn't wired up to this backend yet** (login buttons still point at Koodo's own backend, `DatabaseService` still uses `localforage`) because the OAuth app registrations are waiting on BTECH's approval. In the meantime, `functions/_middleware.ts` intercepts every request outside `/api/*` with a temporary "under construction" page — that's intentional, not a bug, so don't delete it by accident, but also don't forget to remove it before actually going live.

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
│   ├── _middleware.ts      # ⚠️ currently intercepts everything outside /api/* with an "under construction" page
│   ├── api/
│   │   ├── auth/           # Google/Microsoft OAuth login + session
│   │   ├── db/[dbName].ts  # Generic sync API, mirrors DatabaseService's web branch
│   │   └── books/          # Shared book-catalog API (list/upload/download; admin-only add/remove)
│   └── lib/                # Shared helpers (session, oauth, auth checks, R2 streaming)
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
│   ├── pages/              # Page-level components (manager, reader, login, redirect, stats)
│   ├── router/             # React Router config
│   ├── store/              # Redux (actions + reducers)
│   └── utils/              # Utilities
│       ├── file/           # File operations (bookUtil, coverUtil, fontUtil, sqlUtil, export, backup, restore)
│       ├── reader/         # Reader logic (highlightUtil, noteUtil, styleUtil, ttsUtil, themeUtil, etc.)
│       ├── request/        # HTTP requests
│       └── storage/        # Storage services (databaseService, syncService)
└── scripts/                # i18n tooling (extract-untranslated, merge-translations) + LTI setup (generate-lti-keypair)
```
