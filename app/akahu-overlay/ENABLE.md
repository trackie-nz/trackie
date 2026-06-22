# Re-enabling the Akahu overlay (dormant)

Akahu bank sync is **deferred**. The production build is based on a released
Actual tag and applies only the core overlay (`../overlay/` - privacy sign-in +
`/get-started`). The Akahu code lives here, **dormant**, and is *not* applied by
the build.

Our Akahu integration is deliberately **per-user OAuth with our own
`onboard.html`** - not upstream's single-user version - and is to be UX-tested in
NZ. When Akahu is approved, switch it on against whatever Actual release is
current then, as follows.

## What's in this folder

The tree mirrors the Actual monorepo, so re-enabling is mostly "move back":

```
packages/sync-server/src/app-akahu/app-akahu.ts        # per-user OAuth router
packages/sync-server/src/app-akahu/onboard.html        # our connect UX
packages/sync-server/migrations/1750000000000-akahu-per-user.js
packages/sync-server/migrations/1750000001000-akahu-oauth-states.js
```

## Steps to re-enable

1. **Move the files back into the active overlay:**
   ```sh
   cp -r app/akahu-overlay/packages app/overlay/
   ```
   (Both migrations are then picked up automatically by the build-time
   `import.meta.glob` once back under `migrations/`.)

   > **Append-only rule (important).** The migration runner stores its history in
   > `/data/.migrate` and refuses to start if a migration recorded there is
   > missing from the build (`Error: Missing migration file: …`). So once these
   > akahu migrations have been applied to a live `/data` volume, **do not remove
   > them again** for that deployment - i.e. don't disable akahu by deleting the
   > migration files on a volume that already ran them. If you must, either keep
   > the two files in the build, or clear the entries from `/data/.migrate` (or
   > wipe `/data` on a throwaway/test box). Treat all migrations as append-only.

   > **Note on the patch mechanism.** The overlay no longer uses in-place string
   > replacement: substantive code lives in `app/overlay/` drop-ins and the few in-place
   > hooks are `git apply` patch files under `app/patches/`. The Akahu re-enable steps
   > below are therefore authored as new patch files, not as `apply-overlay.sh` edits -
   > see [`../patches/README.md`](../patches/README.md) for how to generate one.

2. **Add the `akahu` npm dependency.** Add a patch `app/patches/akahu-package-json.patch`
   (authored per [`../patches/README.md`](../patches/README.md)) that adds `"akahu": "^2.5.1"`
   to `packages/sync-server/package.json` (or the version the then-current release expects;
   master historically pinned `akahu@^2.5.1`).

3. **Provide `createMutex`** (used by `app-akahu.ts` via `#util/mutex`). At
   `v26.6.0` this file does **not** exist. Either base the build on a release that
   already ships `#util/mutex` (re-verify), or vendor a tiny promise-chain mutex
   in the overlay.

4. **Re-add the `load-config.js` akahu config block** as a patch
   `app/patches/akahu-load-config.patch` (inserted before the `corsProxy: {` block). The
   block is:
   ```js
     akahu: {
       doc: 'Akahu NZ open-banking configuration.',

       appToken: {
         doc: 'Akahu App ID Token (operator credential, shared across all users).',
         format: String,
         default: '',
         env: 'ACTUAL_AKAHU_APP_TOKEN',
       },

       appSecret: {
         doc: 'Akahu App Secret (used for OAuth token exchange).',
         format: String,
         default: '',
         env: 'ACTUAL_AKAHU_APP_SECRET',
       },
     },
   ```

5. **Re-add the `/akahu` route to `app.ts`** by regenerating `app/patches/app-mounts.patch`
   (per [`../patches/README.md`](../patches/README.md)) so it also adds:
   - import: `import * as akahuApp from './app-akahu.js';` after the openid app import
   - mount: `app.use('/akahu', akahuApp.handlers);` after the `/gocardless` mount

6. **Re-add the `onboard.html` copy** in the Dockerfile(s) so it ships alongside
   the bundled chunks:
   ```dockerfile
   RUN cp ./packages/sync-server/src/app-akahu/onboard.html ./packages/sync-server/build/chunks/
   ```

7. **Re-add the Akahu operator credentials** to `compose.yml` (environment) and
   `.env.example`:
   ```yaml
       ACTUAL_AKAHU_APP_TOKEN: ${ACTUAL_AKAHU_APP_TOKEN}
       ACTUAL_AKAHU_APP_SECRET: ${ACTUAL_AKAHU_APP_SECRET}
   ```
   Register the callback URL with Akahu: `<SERVER_HOSTNAME>/akahu/callback`.
   Personal app: https://my.akahu.nz · Production: https://developers.akahu.nz

8. **Build/test** the per-user connect flow end-to-end in NZ.
