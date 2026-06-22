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

| Patch | Target | What it does |
| --- | --- | --- |
| `openid.patch` | `accounts/openid.ts` | Imports `trackie-identity`, derives the account identity via `deriveOpenIdIdentity` (HMAC of verified email), stores `display_name` empty, and removes the later-login re-write so no IdP name/email is ever persisted. |
| `app-mounts.patch` | `app.ts` | Mounts the `/get-started` route and the deny-by-default `trackieAdminGuard` ahead of the `/admin` router. |

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
