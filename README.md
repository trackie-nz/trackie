# Trackie

### Money sorted. Feet up.

**Free, private budgeting for New Zealand.** Trackie is a hosted home for
[Actual Budget](https://actualbudget.org) - a fast, private, open-source budgeting
app - run free for anyone in Aotearoa. Sign up with your email, get your own private
budget, and optionally sync your NZ bank transactions automatically.

👉 **Use it:** **[trackie.nz](https://trackie.nz)** &nbsp;·&nbsp; no cost, no ads, no
data harvesting, New Zealand only.

> **Why this repository exists.** This is the *actual code* that runs trackie.nz,
> published in the open so anyone can verify exactly what happens to their financial
> data. No analytics, no tracking, no hidden changes - Trackie is standard Actual
> Budget plus one small, auditable New Zealand layer, described below.

## New here? Start with these

- **[About Trackie - in plain language](docs/about-this-service.md)** - what Trackie
  is, why it is free, how your data is kept safe, and why connecting a bank is
  entirely optional. Start here if you just want to understand the service.
- **[Security & privacy](docs/security-and-privacy.md)** - the technical detail:
  identity, per-user isolation, end-to-end encryption, and the hardened bank-connect
  flow. For technically-minded users (and the Akahu review team).

## What you get

- **Your own private budget**, created automatically the first time you sign in.
- **Passwordless sign-in** - a one-time code sent to your email. Nothing to remember,
  no password to leak.
- **Optional end-to-end encryption** you control. Turn it on with your own password
  and not even the operator can read your budget. (There is no password recovery -
  keep it safe.)
- **Optional NZ bank sync** via [Akahu](https://akahu.nz) - connect your own accounts
  so transactions import automatically. Entirely opt-in; Trackie works fully with
  manual import (CSV / OFX / QIF / QFX) and no bank connection at all.
- **No lock-in** - export your full budget any time and take it anywhere.

## What Trackie adds to standard Actual Budget

Trackie runs the real Actual Budget server, with a few small, public changes, all
there to make a safe, free, multi-user NZ service work:

1. **Per-user NZ bank sync (optional).** Upstream Actual has a single-user Akahu
   integration (one global token, pasted in by the server admin). Trackie replaces it
   with **per-user OAuth**: each person connects their own NZ bank accounts
   independently, and the connection is read-only and private to them. No one else
   can see your bank data, and nothing in Trackie can move money.
2. **Privacy-preserving sign-in.** Upstream keys each user on whatever the login
   provider sends (which can store the raw email and breaks when a field is empty).
   Trackie instead stores an irreversible `HMAC-SHA256(verified_email, secret)`
   fingerprint - so the account database holds **no readable email address** - and
   rejects any login without a verified email.
3. **One-click sign-in deep link.** Upstream sends a new user to a `/login` page
   where they must click "Sign in with OpenID" before the browser is handed to the
   identity provider. Trackie adds a `/get-started` route that performs that first
   step server-side (it calls the same `loginWithOpenIdSetup()` upstream uses). It
   returns a tiny interstitial that primes the web client's stored server URL and
   then forwards to the IdP - the priming is what lets a brand-new visitor's sign-in
   complete instead of stalling on the post-login callback. It is unauthenticated,
   touches no user data, and falls back to the normal `/login` page on any error.
4. **Locked-down admin surface.** Upstream's multi-user build exposes a user directory
   and file-sharing endpoints under `/admin`. Because Trackie hosts unrelated people
   rather than one household, a deny-by-default gateway blocks that whole namespace for
   everyone except the operator - so no user can see another user's account - and any
   endpoint a future upstream release adds there is closed by default.

Everything else is unmodified upstream Actual Budget. The complete diff is a handful of
small drop-in files plus two small `git apply` patches (in [`app/patches/`](app/patches)):

| Change | What it does |
|--------|-------------|
| `app/overlay/.../app-getstarted.ts` | `/get-started` route - server-side OpenID kick-off; serves an interstitial that primes the web client's stored server URL, then forwards to the IdP so cold deep-links complete sign-in |
| `app/overlay/.../accounts/trackie-identity.ts` | Derives the account identity as `HMAC-SHA256(verified_email, secret)` and rejects logins without a verified email, so the database stores no readable address |
| `app/overlay/.../util/trackie-admin-guard.ts` | Deny-by-default `/admin` gateway - blocks the user-directory and management endpoints for everyone except the operator (one unauthenticated exception for the login bootstrap check) |
| `app/patches/openid.patch` | Wires in the HMAC identity and stores `display_name` **empty**, so neither name nor email is persisted |
| `app/patches/app-mounts.patch` | Mounts `/get-started` and the admin gateway ahead of the upstream routers |

To see exactly what is applied to upstream, read the files under
[`app/overlay/`](app/overlay) and the patches in [`app/patches/`](app/patches) (applied by
[`app/apply-overlay.sh`](app/apply-overlay.sh)). The
[security & privacy](docs/security-and-privacy.md) doc walks through the why of each.

The per-user Akahu bank-sync overlay is **dormant** - it is kept under
[`app/akahu-overlay/`](app/akahu-overlay) (with a re-enable runbook) and is **not**
applied by the build until Akahu approves Trackie's application.

## Bank sync status

Automatic NZ bank sync is **built but not switched on yet** - it is waiting on Akahu
to approve Trackie's open-banking application. Until then everyone uses manual import,
which is a perfectly good way to budget. See
[docs/akahu-app-submission.md](docs/akahu-app-submission.md) for the application
details.

## Want to run your own?

You do **not** need Trackie to self-host Actual Budget - Actual is open source and the
official project has excellent
[self-hosting docs](https://actualbudget.org/docs/install/). The files in this repo
(`app/server.Dockerfile`, `app/compose.yml`, `app/compose.logto.yml`, `app/overlay/`) are published
for **transparency and reproducibility** - so the full live stack is auditable - not
as a separate product to install. If you do reuse them, the one rule that matters:
generate `ACTUAL_IDENTITY_SECRET` once and never lose or rotate it (see
[`app/.env.example`](app/.env.example)).

**Data & migrations.** Each deployment keeps its DB migration history in
`/data/.migrate`, and the runner refuses to start if a migration recorded there is
absent from the build (`Missing migration file: …`). Two consequences: start a new
deployment from a **fresh `/data`** on this release build, and treat migrations as
**append-only** - never remove a migration that a live volume has already applied
(this is why Akahu's dormant migrations live outside the build until it is enabled).

## Credits

Trackie is built on [Actual Budget](https://actualbudget.org) (MIT) and run by
[Alan Grainger](https://github.com/alangrainger). NZ bank sync is powered by
[Akahu](https://akahu.nz). Trackie itself is MIT-licensed - see [LICENSE](LICENSE).
