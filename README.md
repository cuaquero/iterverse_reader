<div align="center">
  <img src="src/assets/images/btech/logo-mark.png" width="96px" height="96px" alt="BTECH Reader logo" />
</div>

<h1 align="center">Bindo Reader</h1>

<h3 align="center">
  BTECH IT Department's ebook reader, forked from Koodo Reader
</h3>

<div align="center">

[CLAUDE.md](./CLAUDE.md) — architecture &amp; conventions · [CLOUDFLARE.md](./CLOUDFLARE.md) — backend reference

</div>

## What this is

This is BTECH's internal fork of [Koodo Reader](https://github.com/koodo-reader/koodo-reader), an open-source ebook reader, customized for deployment as a web app at `books.itstem.org` and (eventually) embedded in Canvas via LTI.

It is **not** the upstream open-source project — this fork has diverged in ways specific to BTECH's deployment:

- **Web-only.** Electron desktop packaging has been removed entirely (no installers, no native SQLite, no desktop-only IPC). See `CLAUDE.md` for what that changed.
- **Cloudflare backend.** Pages Functions + D1 + R2 + KV handle auth and data sync, replacing Koodo's own hosted backend. See `CLOUDFLARE.md`.
- **Feature set trimmed** for an institutional deployment — no Pro paywall, no Koodo-hosted cloud sync, no plugin marketplace, no auto-update, cloud-drive sync reduced to local-folder only, a handful of third-party note-sync integrations removed. Anki and Markdown export were kept.
- **Branded for BTECH**, not Koodo.

## Features

- Reads EPUB, PDF, DRM-free MOBI/AZW3/AZW, TXT, FB2, CBR/CBZ/CBT/CB7, MD, DOCX, and HTML/XML/XHTML/MHTML/HTM
- Bookmarks, notes, and highlights, with export to Markdown or Anki
- Reading-progress sync with KOReader
- Adjustable font, spacing, margins, themes, and night mode
- Text-to-speech, translation, and dictionary lookups (via configured plugins)
- Local MDX dictionary lookup
- Reading statistics

## Develop

```bash
git clone https://github.com/mfoster-stem/koodo-bridge.git
cd koodo-bridge
yarn
yarn start   # dev server, browser hot reload
yarn build   # production build
```

There's no `yarn dev` anymore — that ran the removed Electron desktop shell. For the Cloudflare backend (Functions/D1/R2/KV), see [CLOUDFLARE.md](./CLOUDFLARE.md).

## License

Licensed under [AGPL-3.0](./LICENSE), same as upstream Koodo Reader. Because this fork is run as a network service, AGPL's network-use clause applies: anyone interacting with the deployed app is entitled to the corresponding source for exactly what's running, which is this repository — kept public for that reason.

Upstream project: [koodo-reader/koodo-reader](https://github.com/koodo-reader/koodo-reader).
