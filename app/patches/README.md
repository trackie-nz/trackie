# In-place patches

The overlay applies its changes to upstream `actualbudget/actual` in two ways:

- **`overlay/`** holds whole drop-in files (real, type-checked `.ts` compiled by the
  normal build) - the substantive logic lives here.
- **`patches/`** (this folder) holds the few unavoidable *in-place* hooks into upstream
  files, as standard unified diffs applied with `git apply`.

`apply-overlay.sh` copies the drop-ins, then runs `git apply --verbose patches/*.patch`
in alphabetical order against a fresh upstream checkout. `git apply` uses **zero fuzz**,
so if upstream drifts the affected lines, the build **fails loudly** and the patch must be
regenerated - this is the drift detector, no anchor strings to maintain.

## Current patches

Patches apply in alphabetical order. Server-side patches target `packages/sync-server`;
client-side patches target `packages/desktop-client` and `packages/loot-core` and only take
effect in a full client build (not the fast `server.Dockerfile` shortcut).

| Patch | Target | What it does                                                                                                                                                                                                            |
| --- | --- |-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `app-mounts.patch` | `sync-server/.../app.ts` | Mounts the `/get-started` route and the deny-by-default `trackieAdminGuard` ahead of the `/admin` router, and adds a `Cache-Control` policy to the static serve: everything is pinned immutably for a year except a denylist of stable-URL bootstrap files (`index.html`, `sw.js`, `data-file-index.txt`, `sql-wasm.wasm`) that always revalidate, so the CDN can serve assets off the origin without a deploy ever leaving a browser pinned on a stale client. |
| `branding.patch` | `desktop-client/index.html` + `public/site.webmanifest` | Rebrands the browser tab title and PWA `name`/`short_name` from "Actual" to "Trackie".                                                                                                                                  |
| `openid.patch` | `sync-server/.../accounts/openid.ts` | Imports `trackie-identity`, derives the account identity via `deriveOpenIdIdentity` (HMAC of verified email), stores `display_name` empty, and removes the later-login re-write so no IdP name/email is ever persisted. |
| `prefs-defaults.patch` | `desktop-client/.../prefs/prefsSlice.ts` | Seeds NZ display defaults (DD/MM/YYYY dates, Monday first day of week) at the single `loadPrefs` injection point; a trailing spread lets any saved value win. Display-only.                                             |
| `settings-page.patch` | `desktop-client/.../settings/index.tsx` | Removes the Authentication-method section and the update-notification opt-in checkbox, and rebrands the About tagline to "Trackie". Keeps the Release Notes link.                                        |
| `theme-catalog.patch` | `desktop-client/.../hooks/useThemeCatalog.ts` | Injects a "Trackie" entry into the Global Catalog so a user who has switched to a built-in theme can reinstall Trackie by name; CSS is fetched from the source repo on install. |
| `loot-core-prefs.patch` | `loot-core/.../preferences/app.ts` | Global-pref defaults: seeds the Trackie theme as a pre-installed light custom theme (drop-in `preferences/trackie-theme.ts`) and defaults the base theme to light so it shows - a user can pick any built-in theme to remove it; defaults `notifyWhenUpdateIsAvailable` off. |

## Regenerating a patch (after an upstream bump, or to edit one)

Patches are authored against a real checkout so you get full IDE support, not by editing
the diff text by hand:

```sh
git clone https://github.com/actualbudget/actual.git /tmp/actual
cd /tmp/actual && git checkout v<ACTUAL_VERSION>
# edit the target file with full tooling, then:
git diff -- packages/sync-server/src/accounts/openid.ts > <repo>/app/patches/openid.patch
git checkout -- .   # discard the working edit; the patch is the artifact
```

Verify it still applies zero-fuzz before committing:

```sh
git -C /tmp/actual apply --check --verbose <repo>/app/patches/openid.patch
```
