# Investigation: forking Kavita as a Koodo/Reader replacement

**Status:** decided and forked (2026-09-25). Product name: **Iterverse Library**.
Fork lives at [cuaquero/iterverse_library](https://github.com/cuaquero/iterverse_library),
cloned locally at `~/Documents/GitHub/iterverse_library` - a sibling repo to
this one, not a subdirectory of it. Follows the exact same pattern as this
repo's own `koodo-reader` → `iterverse_reader` fork: `origin` is the fork,
`upstream` tracks `Kareadita/Kavita` directly, so `git fetch upstream` +
merge/rebase stays available going forward. Scope: a full rebrand (new name,
logo, "powered by" line removed or changed) rather than theme-only, guided
directly by `ad_labs`'s `design-system/` (the canonical Iterverse brand
assets/tokens - see the Branding section below for the correction on the
"Nest" reference this doc originally cited) - see the fork-scoping section
below for the ground rules this needs to follow to stay upstream-mergeable.
**Rebrand pass 1 done (2026-09-25)** - name, logo/favicon/PWA icons, and
accent color all rebranded and visually verified; see "Rebrand pass 1" section
near the end of this doc for exactly what changed, what's still unverified,
and open follow-ups.
**Author:** Matthew Foster, with Claude (research pass 2026-09-24, fork
created 2026-09-25, rebrand pass 1 2026-09-25)

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
- **Branding**: Kavita has a built-in CSS-variable theme system for colors,
  which covers most of "look like Iterverse" without touching source at all.
  **Correction (2026-09-25):** this section originally cited a fork called
  "Nest" (`camplight/nest`) as prior art for admin-configurable branding -
  that turned out to be wrong. Checked its actual GitHub metadata while trying
  to use it as a reference and found it's a fork of `camplight/orgops`, an
  unrelated TypeScript project with no connection to Kavita. The claim was
  never verified against the repo directly when first researched - a real
  miss, caught only once actually needed. No working reference implementation
  exists as far as this investigation has found; the rebrand proceeds directly
  from `ad_labs`'s `design-system/` tokens/assets instead; see the "Rebrand"
  section below.

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

For anything theming can't reach (site name, logo asset, "powered by" line):
no working reference fork was found (see the correction in the TL;DR above -
a previously-cited "Nest" fork turned out to be unrelated to Kavita, an error
caught only once the doc's own advice to "read it directly" was actually
followed). This isn't a blocker - BTECH doesn't need Nest's actual feature
anyway (a *runtime-configurable*, multi-tenant branding system); this is one
fixed deployment with one fixed brand, so a direct, static rebrand (replacing
Kavita's own hardcoded name/logo/colors with Iterverse's, guided by
`ad_labs`'s `design-system/` tokens/assets) is both simpler and a better fit
than building configurability nobody needs.

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
- **Isolate unavoidable source changes to a small, named surface.** Keep
  rebrand edits in clearly-separate files/components (a dedicated branding
  module/constants file, not edits scattered through every view that happens
  to say "Kavita") rather than touching the same logic upstream is actively
  developing — same principle CLAUDE.md already documents for how `--btech-*`
  tokens were kept in Reader instead of renamed everywhere.
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

## Spike results (2026-09-25): the OIDC blocker is confirmed, not theoretical

Ran the spike on a Proxmox VM (Ubuntu 24.04, Docker, `linuxserver/kavita`, fronted by
a named Cloudflare Tunnel at a real `iterverse.net` hostname so the OIDC redirect
had a trusted HTTPS callback). Result: **the exact failure from [Kavita#4726](https://github.com/Kareadita/Kavita/issues/4726)
reproduces on the current version (0.9.1.4, essentially the same as the issue's 0.9.0)**,
not just a risk from an old GitHub thread.

What was tested and ruled out first:
- Kavita's `oidcConfig` (authority/clientId/secret) applied cleanly via its admin API —
  confirmed a real, separate bug in the process: the public `/api/settings/oidc`
  endpoint the login page reads from caches its value in memory and does **not**
  pick up a settings change until the container restarts. Any future OIDC config
  change on a real deployment needs a restart to take effect, not just a save.
- Cloudflare Access's own "Advanced OIDC flows" setting was checked and is already
  on **"No additional OIDC flows"** — the standard authorization-code flow, which is
  the recommended/default and exactly what Kavita's OIDC client should expect. There
  is no `response_mode`/`response_type` override exposed anywhere in Access's SaaS-app
  UI to try as an alternative.

With the Access side confirmed correct, the login attempt (real Access OTP login,
policy-gated, successful up through Access's own auth) still failed on the callback
into Kavita with:

```
Microsoft.AspNetCore.Authentication.AuthenticationFailureException: Unknown response type:
```

**Root cause found, and it's precise.** Cloned Kavita's actual source
(`Kareadita/Kavita`, current `main`) and grepped for the error string's origin. It is
**not** Kavita's own code — it's thrown by Microsoft's shared ASP.NET Core OIDC
middleware, in `OpenIdConnectHandler.GetUserInformationAsync()`
([source](https://github.com/dotnet/aspnetcore/blob/main/src/Security/Authentication/OpenIdConnect/src/OpenIdConnectHandler.cs#L1083)):

```csharp
return HandleRequestResult.Fail("Unknown response type: " + contentType?.MediaType, properties);
```

This fires *after* a successful authorization-code → token exchange, while fetching
additional claims from the provider's **UserInfo endpoint** — the middleware requires
that response's `Content-Type` header to be exactly `application/json` or
`application/jwt`; anything else (including a missing header entirely, which matches
our blank error value) fails hard. Cloudflare Access's UserInfo endpoint response
almost certainly isn't returning one of those two exact values.

The reason this call happens at all, and can't be avoided from Kavita's admin
settings: `Kavita.Server/Extensions/IdentityServiceExtensions.cs:241` hardcodes
`options.GetClaimsFromUserInfoEndpoint = true;`. Checked the full backing
`OpenIdConnectSettings` config class (`Kavita.Common/Configuration.cs`) — it only
has `Authority`/`ClientId`/`Secret`/`CustomScopes`, no toggle for this at all. So this
isn't a misconfiguration on either side; it's a fixed behavior in Kavita's code path
that Cloudflare Access's response shape doesn't satisfy.

Notably, Kavita already explicitly maps `email`/`name`/`given_name` from claims
(`options.ClaimActions.MapJsonKey(...)`, same file) — claims that are also present
directly in the ID token for most providers, including Access. That suggests the
UserInfo call may not be strictly necessary for login to work at all, which is what
makes this look like a narrow, viable patch rather than a fundamental incompatibility.

**This changes the risk assessment from the earlier section of this doc.** "Auth is
config + one small Worker, no fork needed" was the hoped-for outcome; what's actually
true today is that Cloudflare Access cannot complete an OIDC login into Kavita at all
as shipped, independent of the roster-entitlement bridge work, which was never
reached. Before committing further to the "branding-only fork" plan, this needs one of:

- **Testing a one-line patch** (`options.GetClaimsFromUserInfoEndpoint = false;`, or
  making it configurable and defaulting it off) against a locally-built Kavita image,
  to confirm login completes and the mapped claims (email/name) still arrive correctly
  from the ID token alone. Not yet done — this is the next concrete step, and would
  need .NET build tooling on the spike VM or a local dev machine.
- Filing this upstream with the precise diagnosis above — much more actionable than
  [#4726](https://github.com/Kareadita/Kavita/issues/4726)'s original thin report, and
  a plausible small accepted fix (possibly with a config toggle) rather than a
  Kavita-specific incompatibility to route around.
- If upstream doesn't take it, this would be the one exception worth making to the
  "never touch core auth in the fork" rule from the scoping section above — but only
  this one narrow line, kept in its own commit, clearly documented, and revisited
  every time the fork rebases against upstream in case they fix it independently.

## Patch attempt (2026-09-25): in progress, interrupted by an infra outage

Went looking for whether the UserInfo-endpoint bug above is actually fixable with a
small patch, rather than just diagnosed. Progress so far:

- Installed .NET 10 SDK locally on the spike VM (`dotnet-install.sh`, user-local, no
  sudo) and cloned `Kareadita/Kavita` from GitHub. A baseline build of just
  `Kavita.Server` succeeded, confirming the toolchain works.
- Applied the one-line patch: `IdentityServiceExtensions.cs:241`,
  `options.GetClaimsFromUserInfoEndpoint = true` → `false`.
- **First build attempt (against `main` HEAD) hit an unrelated crash** —
  `System.ArgumentNullException` on a null `TokenKey` inside JWT setup — caused by
  version skew: `main` is many months ahead of the `v0.9.1.4` release our Docker
  container is running, and the manual-migration chain isn't designed for that large
  a jump against an existing database. Not a real finding, just a self-inflicted
  confound — checked out the actual `v0.9.1.4` git tag instead (the patch survived
  the checkout cleanly) and rebuilt against that; the TokenKey crash disappeared.
- Copied the running container's `config/` (DB, settings, admin account) into a test
  directory so the patched binary could reuse the existing OIDC settings without
  redoing setup, stopped the Docker container to free port 5000, and ran the patched
  build directly (framework-dependent, no Angular UI built — acceptable since this
  is an auth-only test, not a full functional one).
- Retried the OIDC login through the same Cloudflare Tunnel hostname. Got a **new**
  error this time: `"No authentication handler is registered for the scheme
  'OpenIdConnect'"` — meaning OIDC wasn't actually registered as enabled on the fresh
  process at all. Leading unconfirmed hypothesis: the client secret may be encrypted
  at rest using Kavita's JWT `TokenKey`, and since this fresh process logged
  "Generating JWT TokenKey..." again (implying a **new** key rather than reusing
  whatever key the original container used), the copied secret may be failing to
  decrypt — which would make `oidcConfig.Enabled` compute as false. **Not confirmed**
  — never got to check `/api/Settings` on the patched instance before losing
  connectivity (below).

**Then the spike VM and the whole Proxmox host became unreachable** (SSH timed out
entirely; the public tunnel hostname returned Cloudflare's `530`, indicating the
tunnel connector itself had dropped). Two hypotheses, neither confirmed as of this
writing, actively being investigated by Matthew directly against the Proxmox host:

- **Resource exhaustion**: this VM was sized for running the packaged app alone
  (2 vCPU / 2GB was the spike recommendation earlier in this doc), not for also
  running the .NET SDK, Roslyn's background compiler server, and MSBuild
  concurrently with a live Kavita process. That's plausibly enough to have pushed a
  2GB-class VM into OOM territory. If this is what happened, the fix is simply more
  RAM before resuming any build work on this VM — build tooling alongside a running
  app needs meaningfully more headroom than the app alone.
- **Network-level block**: BTECH's own network already showed one instance of
  targeted TLS interception in this same session (the `*.trycloudflare.com` quick
  tunnel got MITM'd earlier — see the spike-plan section below). Today's workload
  generated a lot more traffic than that one blocked request (a 240MB SDK download,
  several git clones, a sustained tunnel connection) — plausible trigger for a
  subnet-wide defensive block, if BTECH's firewall does that as a known behavior.
  Checked whether this matched the separate, already-logged "recurring `/no-access`
  lockout" issue from earlier project work — it doesn't; that one is an
  application-level roster-entitlement API token problem on Reader sign-ins, unrelated
  to network/firewall connectivity.

**Next steps once access is restored:** bump the VM's RAM if resource exhaustion is
confirmed as the cause; then, as the first diagnostic step before anything else,
check `/api/Settings` on the patched instance to see whether `oidcConfig.secret` and
`oidcConfig.enabled` actually came through the config copy correctly. If the secret
didn't survive the copy, the cleanest fix is re-entering the OIDC secret directly
against the patched instance (not copying it) so the `GetClaimsFromUserInfoEndpoint`
patch can actually be tested in isolation, rather than confusing "config didn't
transfer" with "the patch doesn't work."

## Patch confirmed working (2026-09-25)

After the infra outage above (root cause: an IP conflict with the separate Iterverse
Scheduler VM over `.70` — the spike VM now has its own static `.21`, unrelated to
Kavita itself but worth remembering if this VM ever needs re-networking again), and
after ruling out a copied-database confound as the actual source of the
"OIDC not enabled" symptom seen mid-test (a **fresh** admin account + fresh
`oidcConfig` applied via the API, rather than copying an existing SQLite DB, is the
reliable way to test this — copying the DB across process restarts introduced at
least one confound, likely related to how the JWT `TokenKey` interacts with
encrypted-at-rest settings; not root-caused further since it's a testing artifact,
not a product concern):

**The one-line patch works.** With `GetClaimsFromUserInfoEndpoint = false` and a
freshly-configured `oidcConfig` (same Authority/ClientId/Secret as the original
failing test), a real Cloudflare Access OTP login completed the entire flow
end-to-end for the first time — server log:

```
Kavita.Services.OidcService Creating new user from OIDC: m*************@btech.edu - <oidc-sub>
```

No `"Unknown response type"` error. A new Kavita account was auto-provisioned
correctly from the Access identity. This confirms the diagnosis from the section
above was correct and sufficient — the UserInfo-endpoint call really was the entire
blocker, and skipping it is enough for login to work.

**What's still unverified, deliberately out of scope for this pass:** role/library
claim mapping (`syncUserSettings` was left `false` for this test, so the new user got
Kavita's bare defaults, not anything derived from a roster role) and the
roster-entitlement bridge (Access's own policy gated this login, but nothing yet
routes through the actual `checkRosterEntitlement` check the way Reader's
`access.ts` does). Both are the next real steps, not blocked by anything found here.

**Recommendation:** file this upstream with the precise diagnosis (UserInfo
Content-Type strictness + hardcoded `GetClaimsFromUserInfoEndpoint`), since it's a
much more actionable report than the original thin issue and plausibly gets fixed
or made configurable in Kavita itself — which would mean this fork needs no source
changes at all, only configuration. If upstream doesn't act on it, this one line is
the closest thing to a justified exception to "never touch core auth" from the
fork-scoping section above — precisely because it's this narrow, this well-understood,
and there's a real chance it gets superseded by an upstream fix.

## Role/library claim mapping: built and confirmed working (2026-09-25)

Picked up the two open items from the last spike session: role/library claim
mapping (this section) and the roster-entitlement bridge (partially addressed
below, not finished).

**Why Access's own claim-mapping UI couldn't do this.** Investigated
Cloudflare Access's "Add claim"/"IdP claim" feature on the SaaS OIDC
application directly (the natural first thing to try, since Matthew already
had exactly the right list ready to reuse - the "Instructor Dashboard Users"
Access policy, a plain inline email list spanning several BTECH-partner
districts, already used by 9 other Iterverse apps as their admin gate). Result:
that feature only maps claims from an *externally connected* Zero Trust
identity provider (Okta, Entra, etc.) - confirmed both empirically (the IdP
claim dropdown shows "No valid options" no matter which scope is selected,
since Access's own OTP is the identity source here, not an external IdP) and
via Cloudflare's own docs. Access's native Groups/policies are simply not
exposed as an OIDC claim to a downstream SaaS app - a real gap in the model,
not a missing checkbox.

**The fix: `kavita-oidc-bridge`, a new standalone Cloudflare Worker** (new
top-level directory in this repo, deployed as its own Worker - NOT part of
this repo's `functions/`/Pages deployment, kept clearly separate per
CLOUDFLARE.md's note). It's a minimal OIDC provider: Kavita's `authority` now
points at this bridge instead of Access directly, but the actual
authentication is still 100% Access - the bridge's own `/authorize` route
sits behind a normal Access Application (self-hosted, OTP, same pattern as
this repo's own `functions/api/auth/access.ts`, whose JWT-verification code
was copied in verbatim rather than reimplemented). After Access verifies who
someone is, the bridge checks their email against the same "Instructor
Dashboard Users" list (currently a manually-maintained copy, not a live API
call to Access - see the code comment in `src/index.ts` for why that's a
deliberate, documented tradeoff for now) and mints its own signed OIDC token
carrying a real role claim (`Admin`+`Login`, or just `Login`) using Kavita's
*default* `RolesClaim` name - no Kavita-side config beyond `authority`/
`clientId`/`secret` and flipping `syncUserSettings` to `true`.

**Confirmed working end-to-end** - server log from a real Access OTP login:

```
Kavita.Services.OidcService Syncing access roles for user 2, found roles ["Admin","Login"]
Kavita.Services.OidcService User 2 is admin, granting access to all age ratings
```

**A second BTECH-network TLS-interception incident, same pattern as the
`trycloudflare.com` one from the last session:** the bridge's default
`*.workers.dev` hostname hit the identical `UntrustedRoot` failure - BTECH's
firewall doesn't trust that domain either, confirmed both via .NET's own
exception (`AuthenticationException: ... UntrustedRoot`) and a matching `curl`
failure from the VM. Fixed the same way as last time: gave the Worker a real
hostname under `iterverse.net` (Workers → Custom Domains) instead of the
shared `workers.dev` one. Worth remembering as a standing rule for anything
hosted on this network going forward: **never rely on a shared/anonymous
Cloudflare hostname (`*.workers.dev`, `*.trycloudflare.com`) reachable from
inside BTECH's own network - always attach a real `iterverse.net` (or other
owned-zone) hostname first.**

## Roster-entitlement bridge: built and confirmed working (2026-09-25)

The remaining open item from the section above - the bridge's own Access
Application gate was a stand-in broad policy, not the real entitlement check.
Fixed by adding `checkRosterEntitlement` (copied verbatim from this repo's
`functions/lib/roster.ts`, same precedent as `access.ts`) directly into
`kavita-oidc-bridge`'s `/authorize` handler: after Access verifies who someone
is, the bridge now calls the same Iterverse roster service Reader's own
`access.ts` calls, with `product: "kavita"` instead of `"reader"`, and rejects
before ever minting a code if the response isn't `entitled: true` - mirroring
Reader's "reject before creating a session" pattern exactly.

**Confirmed working for the positive case** - a real login (Matthew's own
account, an active, entitled BTECH identity) completed the entire chain
end-to-end with the roster check now in place, still correctly syncing
`["Admin","Login"]` roles afterward. Since `checkRosterEntitlement`'s `fetch`
isn't wrapped in a try/catch, a network/DNS failure calling the roster API
would have surfaced as a hard 500 rather than a silent pass - the clean
success is real evidence the call executed, not just that it was skipped.

**Not yet tested: the negative case** (a non-entitled email correctly getting
bounced with `error=access_denied`). No second, non-entitled test account was
available to exercise this live - the rejection path is implemented and code-
reviewed against the identical logic Reader's own `access.ts` already runs in
production, but hasn't been independently verified end-to-end the way the
positive case has.

**One open question, unconfirmed either way:** whether `iterverse_hub` (the
roster service) needs `"kavita"` pre-registered as a known product, or treats
that field as free-form/log-only. This is the first non-Reader caller of
`checkRosterEntitlement` - worth checking with whoever owns `iterverse_hub`
before trusting this in anything beyond a spike, in case entitled accounts
get rejected specifically because Kavita as a product isn't recognized yet
(which the code above wouldn't distinguish from a real "not entitled" - the
same class of ambiguity the `/no-access` runbook in CLOUDFLARE.md already
warns about for Reader).

**Also still open:** whether the bridge's own gating Access Application
should now be widened from "Student Login (OTP)" to something closer to
Reader's own model (any OTP'd email, no policy-level allowlist, since the
roster check *is* the real gate) - left as-is for this pass since narrowing
access is always safer than widening it without discussion, but worth
revisiting once the "kavita" product-registration question above is settled.

**Filed upstream (2026-09-25):** [Kareadita/Kavita#4949](https://github.com/Kareadita/Kavita/issues/4949) -
the UserInfo-endpoint bug from the section above, with the exact file/line
diagnosis and the proposed minimal fix (make `GetClaimsFromUserInfoEndpoint`
configurable). The fix built into the fork here didn't change
that recommendation, just confirmed the whole chain works once it's patched.

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

## Rebrand pass 1 (2026-09-25): name, icons, and accent color

Done directly in the fork (`iterverse_library`, not this repo), guided by
`ad_labs`'s `design-system/` as the source of truth for tokens/assets. Not
yet committed as of this writing - see the note at the very end of this
section.

**Name.** "Kavita" → "Iterverse Library" everywhere it's genuinely this app's
own display branding: page `<title>`, browser tab, the login/splash screen,
the main nav header, `site.webmanifest`'s `name`/`short_name`, and the
dynamic per-page title suffix (`(Iterverse Library)`). Centralized into one
new file, `UI/Web/src/app/branding.ts` (`export const APP_NAME = 'Iterverse
Library'`), referenced from the one place that had three separate literal
occurrences (`kavita-title.strategy.ts`) rather than left as scattered
strings - a future name change touches one file, not a grep-and-replace.

**Deliberately untouched:** every occurrence of "Kavita" under the
`kavita-plus`/`kavitaplus` naming (the vast majority of ~100 files a blind
grep for "Kavita" turns up in `UI/Web/src`). That's Kavita's own real,
separate paid metadata/scrobbling service this app can still talk to as a
client - not this app's own display branding. Renaming those would break a
real integration for no reason, same principle CLAUDE.md already documents
for why `isEnableKoodoSync`/`KoodoFileSystemDB` stayed as-is in Reader.

**Icons/logos.** Regenerated every favicon/PWA/in-app logo asset
(`favicon.ico`, `favicon-{16,32}x{16,32}.png`, `apple-touch-icon.png`,
`android-chrome-{192,256}.png`, `mstile-150x150.png`, `logo-{32,64}.png`,
`logo.png`, `logo.svg`) directly from `ad_labs/design-system/assets/iterverse/
{mark,favicon}.svg` via a one-off `sharp` rasterization script (not checked
into either repo - a throwaway `/tmp` script, easy to reproduce if needed
again for a size that was missed). Apple/Android icons got a solid white
background per platform convention (transparent PNGs look wrong as home-
screen icons); everything else stayed transparent, matching how each was
already used. `browserconfig.xml`'s and `index.html`'s hardcoded tile colors
were also updated to `--btech-red` (`#d22030`) - they were a stray, unrelated
teal (`#4ac694`) that wasn't even Kavita's real accent color's source of
truth (see below), just a hardcoded leftover in two static files.

**Accent color.** Kavita's actual single source of truth for its teal
accent (buttons, links, the login-screen highlight bar) is one CSS custom
property, `--primary-color` in `UI/Web/src/theme/themes/dark.scss`, with
three derived shade variables for hover/pressed states. Swapped the base to
`--btech-red` and derived the three shades proportionally to Kavita's
original shading ratios rather than guessing - the first derived shade came
out within one hex digit of the design system's own official `--btech-red-
dark` token, which was a good sanity check that the ratio-based approach was
reasonable. This was a direct edit to Kavita's own shipped default theme
(not the runs-at-startup `/config/themes/` drop-in mechanism the earlier
"Branding: prior art" section above describes) - a deliberate choice, since
the goal is for this to be the fork's actual out-of-the-box appearance, not
an optional theme a student would have to go find and select themselves.

**Verified how:** built the real Angular UI (`npm run build` in `UI/Web`,
after `npm install` - this was the first time this fork's frontend was
actually built; the whole earlier OIDC spike only ever ran the .NET backend
alone), served the static output directly, and screenshotted/read the DOM
text via the browser pane. Confirmed: correct spelling (a font at that
screenshot's resolution made "Iterverse" visually ambiguous to the eye -
double-checked via actual DOM text extraction, not just looking at the
picture), correct favicon pixel content, and the red accent bar/mark reading
as one consistent color story.

**Not yet verified:** the nav header specifically (`nav-header.component.
html`) only renders post-login, and there's no local backend available on
this Mac (only on the spike VM) to actually reach a logged-in state.
"Iterverse Library" is meaningfully longer than "Kavita" and the nav CSS has
no explicit width/overflow handling on that label - worth an actual visual
check against a real backend before assuming it fits at the `md` breakpoint.

**Open decision, not yet acted on:** several settings/about-page surfaces
still link out to Kavita's own wiki/GitHub/Discord for support - worth
deciding whether BTECH users should land there (the real upstream project,
still genuinely relevant since this fork is Kavita underneath) or be
redirected to BTECH IT's own support channel instead, before this goes live.

**Also confirmed unused, no action needed:** `assets/images/kavita-book-
cropped.png` isn't referenced anywhere in the current UI source - safe to
leave alone (not worth deleting speculatively without confirming it's truly
dead everywhere, e.g. e2e tests), just noting it's not a rebrand concern.

**Status of this work as of context running low this session:** all of the
above is staged as an uncommitted diff in `iterverse_library` (`git status`
shows exactly `branding.ts` new, plus the theme/icon/title files modified -
no build artifacts, both `Kavita.Server/wwwroot/` and `UI/Web/dist/` are
already gitignored). Should be committed before the next session picks this
up, if it wasn't already done by the time this doc update itself was
committed.
