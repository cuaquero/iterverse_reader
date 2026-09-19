<div align="center">
  <img src="src/assets/images/iterverse/mark.svg" width="96px" height="96px" alt="Iterverse Reader logo" />
</div>

<h1 align="center">Iterverse Reader</h1>

<h3 align="center">
  BTECH IT Department's ebook reader, forked from Koodo Reader
</h3>

<div align="center">

[CLAUDE.md](./CLAUDE.md): architecture &amp; conventions · [CLOUDFLARE.md](./CLOUDFLARE.md): backend reference

</div>

## What this is

This is BTECH's internal fork of [Koodo Reader](https://github.com/koodo-reader/koodo-reader), an open-source ebook reader, deployed as a web app at `reader.iterverse.net` (migrated from `books.itstem.org`). Canvas embedding via LTI was explored early on but has been removed - the shared Iterverse roster/entitlement system (Hub, below) is the actual answer for auth across all Iterverse products, making a separate LTI integration redundant; it's recoverable from git history if that ever changes. It's part of **Iterverse**, BTECH IT's umbrella platform alongside [Hub](https://github.com/cuaquero/iterverse_hub) (the shared roster/entitlement service Reader itself depends on), [Labs](https://github.com/cuaquero/iterverse_labs), [Simulations](https://github.com/cuaquero/iterverse_simulations), [Terminal](https://github.com/cuaquero/iterverse_terminal), [Packets](https://github.com/cuaquero/iterverse_packets), [Scripts](https://github.com/cuaquero/iterverse_scripts), [HelpDesk](https://github.com/cuaquero/iterverse_helpdesk), [Type](https://github.com/cuaquero/iterverse_type), and [Scheduler](https://github.com/cuaquero/iterverse_scheduler) - see the Labs repo's `design-system/` for the shared brand tokens and Iterverse mark used here.

It is **not** the upstream open-source project. This fork has diverged in ways specific to BTECH's deployment:

- **Web-only.** Electron desktop packaging has been removed entirely (no installers, no native SQLite, no desktop-only IPC). See `CLAUDE.md` for what that changed.
- **Cloudflare backend.** Pages Functions + D1 + R2 + KV handle auth and data sync, replacing Koodo's own hosted backend. See `CLOUDFLARE.md`.
- **Feature set trimmed** for an institutional deployment: no Pro paywall, no Koodo-hosted cloud sync, no plugin marketplace, no auto-update, cloud-drive sync reduced to local-folder only, a handful of third-party note-sync integrations removed. Anki and Markdown export were kept.
- **Branded for Iterverse**, not Koodo - product name and marketing copy were BTECH's own once already (as "Bindo"), then renamed again to join the Iterverse umbrella; see the git history around the "Iterverse Reader" rename for what changed and why.

## Features

- Reads EPUB, PDF, DRM-free MOBI/AZW3/AZW, TXT, FB2, CBR/CBZ/CBT/CB7, MD, DOCX, and HTML/XML/XHTML/MHTML/HTM
- Bookmarks, notes, and highlights, with export to Markdown or Anki
- Reading-progress sync with KOReader
- Adjustable font, spacing, margins, themes, and night mode
- Text-to-speech and dictionary lookups
- Local MDX dictionary lookup
- Reading statistics

## Develop

```bash
git clone https://github.com/cuaquero/iterverse_reader.git koodo-bridge
cd koodo-bridge
yarn
yarn start   # dev server, browser hot reload
yarn build   # production build
```

There's no `yarn dev` anymore. That ran the removed Electron desktop shell. For the Cloudflare backend (Functions/D1/R2/KV), see [CLOUDFLARE.md](./CLOUDFLARE.md).

## License

Licensed under [AGPL-3.0](./LICENSE), same as upstream Koodo Reader. Because this fork is run as a network service, AGPL's network-use clause applies: anyone interacting with the deployed app is entitled to the corresponding source for exactly what's running, which is this repository, kept public for that reason.

Upstream project: [koodo-reader/koodo-reader](https://github.com/koodo-reader/koodo-reader).
