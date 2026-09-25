# Investigation: forking Kavita as a Koodo/Reader replacement

**Status:** research / pre-spike. No code has been forked yet.
**Author:** Matthew Foster, with Claude (research pass 2026-09-24)

## TL;DR

Iterverse Reader (this repo, forked from Koodo) works, but Koodo's client-side
model — full book download into IndexedDB before anything can be read — is a
structural fail vector, not a bug we can patch out. [Kavita](https://github.com/Kareadita/Kavita)
is a real server (ASP.NET Core + Angular, SQLite-backed) that keeps the book
on the server and only ever sends the client rendered content, which removes
that fail vector at the architecture level rather than papering over it.

The investigation below is more encouraging than expected on two fronts that
looked like they'd require deep forking:

- **Auth**: Kavita already has native OIDC login with claim-driven role/library
  sync. Cloudflare Access can act as a generic OIDC identity provider for a
  third-party app. The Iterverse roster-entitlement check we already run for
  Reader (`checkRosterEntitlement` in [`functions/lib/roster.ts`](../functions/lib/roster.ts))
  is designed to be per-product already (`product: "reader"` today), so gating
  Kavita the same way is plausibly **config + one small bridging Worker**, not
  a C# auth rewrite.
- **Branding**: Kavita has a built-in CSS-variable theme system, and a fork
  called **Nest** ([camplight/nest PR #1](https://github.com/camplight/nest/pull/1))
  has already done exactly what we want — admin-configurable org name, logo,
  and colors — while keeping a "Powered by Kavita" attribution footer. That PR
  is worth reading directly as prior art before writing any of our own
  branding patch.

The one place this is a genuinely bigger lift than Reader, not a smaller one,
is **infrastructure**: Kavita is a persistent process needing real compute and
disk, not a Cloudflare Pages Function. That's why the Proxmox VM spike is the
right next step before committing further.

## Why look past Koodo at all

Koodo/Reader's reading pipeline is: client downloads the full book file →
imports/parses it client-side (`ImportLocal`, `bookMetadataExtractor.ts`) →
stores it in IndexedDB → renders it via the vendored `kookit-extra.min.mjs`
engine. Every step after "download" runs in the student's own browser, on
whatever device and connection they have, with no server-side visibility if
it fails partway. There's no way to monitor or retry a broken import from the
admin side — see CLAUDE.md's own note that `ImportLocal`'s mount was a real,
hard-to-spot regression precisely because this pipeline is easy to silently
break.

Kavita inverts this: the server owns the file, does the parsing/scanning
once, and the client requests rendered pages. Import failures become a server
log line, not a per-student mystery.

## Architecture comparison

| | Iterverse Reader (Koodo fork) | Kavita |
|---|---|---|
| Client | React CRA SPA, static | Angular, served by the .NET app |
| Server | Cloudflare Pages Functions (serverless) | ASP.NET Core (.NET 9), persistent process |
| Database | D1 (SQLite over HTTP) | SQLite, local to the server |
| Book storage | R2, streamed through a Function | Local filesystem (or rclone-mounted remote) |
| Reading model | Full file → client-side parse/render | Server-side parse; client requests rendered content |
| Auth (today) | Cloudflare Access OTP + Google/Microsoft OAuth, roster-gated | Local accounts, or native OIDC with claim-driven roles |
| Per-user content model | Custom-built: `role==="admin"` gates, shared catalog, `HomeList`/`Catalog` | Native RBAC: per-library/per-collection/age-rating permissions |
| License | N/A (private fork) | GPL-3.0 |
| Deployment | Cloudflare Pages (serverless, no VM to manage) | Docker or bare .NET on a host you run |

## Licensing

Kavita is **GPL-3.0**, not AGPL. There's no network-use clause — running a
privately modified fork as an internal BTECH service, without distributing
the compiled binary to anyone outside the organization, does not create a
source-disclosure obligation. (If we ever *did* hand the built app to someone
outside BTECH, GPL-3.0's normal source-availability terms would apply then.)
Worth a real legal/policy sanity check before going further, but this is a
meaningfully lighter obligation than AGPL projects carry.

## Auth & entitlement integration

Three pieces, roughly independent:

1. **Kavita as an OIDC relying party.** Kavita's [OIDC settings](https://wiki.kavitareader.com/guides/admin-settings/open-id-connect/)
   support "sync user settings with OIDC roles" — role, library access, and
   age restrictions can be derived from claims in the ID token at login. This
   is functionally the same job `upsertUser`/`role` do for Reader today.

2. **Cloudflare Access as the IdP.** Access supports a [generic OIDC SaaS
   application](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/saas-apps/generic-oidc-saas)
   connector — not just the pre-built ones (Salesforce, ServiceNow, etc). In
   principle the same Access Application (OTP, no external app registration)
   that gates Reader today could front Kavita too.

3. **Bridging the roster entitlement check.** Access authenticating someone
   only proves they control an email address — the roster check is what
   decides whether that's a real BTECH enrollment (see `access.ts`'s own
   comment on this distinction). Two ways to carry that check over to Kavita
   without touching Kavita's auth code:
   - An [Access External Evaluation policy rule](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/external-evaluation)
     — a thin Worker that calls the same roster API (`product: "kavita"`,
     reusing the existing per-product design) and returns allow/deny — gates
     the Access Application itself, before Kavita ever sees the request.
   - Or a claims-bridging Worker sits between Access and Kavita's OIDC config,
     looks up the user's role via roster/D1, and injects it as a custom claim
     Kavita's "sync roles from OIDC" reads.

   The External Evaluation route is probably cleaner: it keeps entitlement
   logic entirely out of the Kavita fork, in a Worker that looks just like the
   existing Reader auth code.

**If a spike shows this works with zero Kavita source changes**, that's the
outcome to actually hope for — it would mean the "per-user auth" part of this
investigation needs no fork at all, only Access/Kavita configuration plus one
small standalone Worker (which would live in this repo's `functions/`
alongside the existing roster/session helpers, not inside the Kavita fork).

## Branding: prior art already exists

Kavita ships a real theming system — CSS files dropped in `/config/themes/`,
using CSS custom properties, loadable/switchable per-user or admin-defaulted
([wiki](https://wiki.kavitareader.com/guides/themes/)). That covers colors and
most visual restyling without touching Kavita source at all — the same
"swap token values, keep the plumbing" approach already used for `--btech-*`
tokens in this repo.

For anything theming can't reach (site name, logo asset, "powered by" line),
there's a concrete precedent: **[Nest](https://github.com/camplight/nest)**, a
Kavita fork that added an Admin → Branding page (org name, logo, colors) while
keeping upstream attribution. [Read PR #1](https://github.com/camplight/nest/pull/1)
directly before writing any of our own branding patch — it's the exact diff
shape ("what did they touch to make branding admin-configurable") we'd want to
either reuse, adapt, or deliberately diverge from with a documented reason.

Also worth a skim before publishing anything under a new name: Kavita has an
open discussion on [3rd-party naming/trademark expectations for forks](https://github.com/Kareadita/Kavita/discussions/2949)
— not a blocker, but worth knowing what upstream considers acceptable
attribution before we pick a public-facing name.

## Keeping the fork scoped (so `git pull upstream` stays viable)

Given the plan is "fork for branding, not for behavior," the goal is to make
our diff from upstream as small and mechanically separable as possible:

- **Prefer config over code everywhere it's offered.** Theme CSS files, OIDC
  settings, and per-library RBAC are all admin-configurable at runtime — none
  of that belongs in our fork's source at all.
- **Isolate unavoidable source changes to a small, named surface.** If Nest's
  approach (a dedicated Branding admin page) doesn't fully cover it, keep our
  own additions in clearly-separate files/components rather than edits
  scattered through core views — same principle CLAUDE.md already documents
  for how `--btech-*` tokens were kept in Reader instead of renamed everywhere.
- **Never touch core auth/business logic in the fork itself.** Per the auth
  section above, entitlement logic should live in a Worker outside the
  Kavita codebase entirely. That's the single biggest lever for rebase safety
  — if the fork never modifies `Authentication`/`Authorization` internals,
  upstream's own auth changes (they're actively iterating on OIDC — see
  [Kavita issue #2518](https://github.com/Kareadita/Kavita/issues/2518)) merge
  in cleanly instead of conflicting.
- **Track upstream as a real git remote from day one**, not a one-time
  download — `git remote add upstream https://github.com/Kareadita/Kavita`,
  rebase or merge periodically, and treat a growing number of conflicts as a
  signal that our patch has drifted from "branding only."
- **Note Kavita is pre-1.0/beta** with essentially one primary maintainer plus
  one other regular contributor — active, but small, and still moving fast
  enough that upstream refactors (like the OIDC feature itself) are recent.
  Budget for periodic rebase effort, not a one-and-done fork.

## Infrastructure: the actual open question

This is where Kavita is a strictly bigger ask than Reader, not smaller.
Reader's whole backend runs as Cloudflare Pages Functions — no VM, no patching,
no uptime to own. Kavita is a persistent .NET process that needs:

- **Always-on compute** — the Proxmox VM covers this for the spike; for
  production this becomes a real "who patches/reboots/monitors this box"
  question that doesn't exist today for anything else in this stack.
- **Real disk for the library.** Kavita's scanner expects a normal filesystem;
  [S3/R2-compatible storage is reachable only via an rclone mount, not as a
  first-class backend](https://www.tanyongsheng.com/blog/how-to-self-host-your-e-book-library-on-s3-storage-with-kavita-reader/),
  and remote-mounted storage is called out as slow on first scan. The existing
  `btech-books-files` R2 bucket is **not** a drop-in for Kavita's library
  folder — either mirror/sync books onto the VM's local disk, or accept an
  rclone-mount performance hit and test it for real before trusting it.

Neither of these is a blocker, but they're new operational surface that
Cloudflare-only Reader never required, and worth being explicit about before
this goes past a spike.

## Reading-model reality check

Worth being precise about what "streaming" actually buys us, since it's not
uniform across formats: [Kavita's own maintainers are explicit that EPUBs
can't be true page-streamed the way image-based comics/manga are](https://github.com/Kareadita/Kavita/discussions/2590) —
an EPUB is HTML+CSS, so the whole file still gets processed server-side
before the first page is ready, just cached aggressively afterward. The win
for BTECH's actual use case (EPUB-heavy, presumably) isn't "instant streaming
of page 1" so much as "the parse/import step happens once, server-side, and
is retriable/observable" — which is still the thing that matters for killing
the current fail-vector complaint, just not literally the word "streaming."

## Spike plan (Proxmox VM)

Once the VM is up and access is handed over:

1. Deploy vanilla, unmodified Kavita via Docker on the VM — no fork yet.
2. Point it at a throwaway Cloudflare Access Application (test tenant, not the
   real Reader one) configured as a generic OIDC SaaS app.
3. Confirm login round-trips: Access OTP → OIDC token → Kavita session,
   with a real (test) role claim landing correctly via "sync roles from OIDC."
4. Stand up a minimal standalone Worker implementing the roster-entitlement
   bridge (External Evaluation shape) against a fake/test roster response, and
   confirm Access actually blocks/allows based on it.
5. Only after 1–4 work: evaluate what's left (if anything) that would actually
   require Kavita source changes, versus what config already covered.
6. Test the storage question directly — point Kavita at an rclone-mounted R2
   bucket versus local disk with a copied subset of the real catalog, and
   compare first-scan time and read latency.

If steps 1–4 succeed with zero Kavita source edits, that's worth flagging
back before writing a single line of fork code — it would mean the "fork" is
mostly a branding exercise (per the section above) plus infra, not an auth
port.

## Open questions to carry into the spike

- Does BTECH IT have a standing plan for who owns/patches the Proxmox VM
  long-term, or is this VM itself the pilot for "do we want to own a VM at
  all"?
- Is EPUB-heavy content actually representative of BTECH's catalog, or is
  there enough comic/manga-format content that true page-streaming matters
  more than the EPUB caveat above suggests?
- What's the real appetite for a second Iterverse identity integration to
  maintain (Access SaaS app + External Evaluation Worker) alongside Reader's
  existing one — operationally simple in isolation, but it's still one more
  moving part in the shared roster system.
