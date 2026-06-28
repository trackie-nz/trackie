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
| `akahu-app.patch` | `sync-server/.../app-akahu/app-akahu.ts` | Makes upstream's Akahu router per-user with a surgical hook, *not* a fork: swaps the three `secretsService.get` token reads for `getUserTokens(res.locals.user_id)`, wraps the `/transactions` account fetch in the 20h `getRefreshedAccount`, and mounts the `/tokens` set/clear routes - all of which live in the `trackie-akahu.ts` drop-in (no upstream transaction-processing code is copied). Post-#6041. |
| `akahu-auto-sync-financesapp.patch` | `desktop-client/.../components/FinancesApp.tsx` | Calls the `useAkahuAutoSync` drop-in hook (two lines: import + call) so linked bank accounts auto-sync on budget open. All logic lives in the `hooks/useAkahuAutoSync.ts` drop-in. |
| `akahu-auto-sync-prefs.patch` | `loot-core/.../types/prefs.ts` | Adds the `akahu-last-auto-sync` key to the `SyncedPrefs` union - the global per-user 20h gate the auto-sync hook reads/writes (synced via the budget CRDT, so shared across the user's devices). Authored against the *post-#6041* tree (the backport also edits this file's `FeatureFlag` union). |
| `akahu-feature-flag.patch` | `desktop-client/.../hooks/useFeatureFlag.ts` | Defaults the `akahuBankSync` experimental flag to `true` so the Akahu card shows for every Trackie user without the experimental toggle. |
| `akahu-loot-core.patch` | `loot-core/.../accounts/app.ts` | The only patch on this file (one-patch-per-file). Re-adds the `app.method('akahu-accounts', akahuAccounts)` registration that rejects when `apply-overlay.sh` backports PR #6041 (step 0 - the surrounding simplefin/gocardless lines drifted after v26.6.0, where `accounts-bank-sync` still has its `mutator()` wrapper), **and** adds the per-user `akahu-set-tokens` / `akahu-clear-tokens` handlers (POST/DELETE to `AKAHU_SERVER + '/tokens'`) plus their type entries and the `del` import. Authored against the *post-#6041* tree. |
| `akahu-providers.patch` | `desktop-client/.../banksync/useBuiltInBankSyncProviders.ts` | Makes the Akahu card configurable by ordinary users (`canConfigure: true`, since each user manages their own personal token - other providers stay admin-gated), and repoints its reset to a single `akahu-clear-tokens` call instead of two admin-only `secret-set` clears. Post-#6041. |
| `app-mounts.patch` | `sync-server/.../app.ts` | Mounts the `/get-started` route and the deny-by-default `trackieAdminGuard` ahead of the `/admin` router, and adds a `Cache-Control` policy to the static serve: everything is pinned immutably for a year except a denylist of stable-URL bootstrap files (`index.html`, `sw.js`, `data-file-index.txt`, `sql-wasm.wasm`) that always revalidate, so the CDN can serve assets off the origin without a deploy ever leaving a browser pinned on a stale client. Authored against the *post-#6041* tree (the backport adds an `/akahu` mount into the same block), so it assumes step 0 of `apply-overlay.sh` has run. |
| `bank-sync-labels.patch` | `desktop-client/.../modals/SelectLinkedAccountsModal.tsx` | Rebrands the bank-link modal's account column header from "Account in Actual" to "Account in Trackie", and shows a "Click to select account" placeholder in that column's cells when no local account is yet linked. Display-only. |
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
