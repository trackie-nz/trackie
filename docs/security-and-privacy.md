# Security and privacy

How Trackie ([trackie.nz](https://trackie.nz)) is built to protect users' financial
data: the architecture, the trust model, and the specific measures around login, data
isolation, and NZ bank sync. Written for technically-minded users and for the Akahu
review team. For the plain-language version, see
[about-this-service.md](about-this-service.md).

> **Status: Trackie is live** at [trackie.nz](https://trackie.nz). NZ bank sync is
> implemented in the code here but not switched on for users yet - it is pending
> Akahu's approval. Where a measure is planned rather than already in place, it says
> so explicitly.

## Contents

- [Summary](#summary)
- [Architecture](#architecture)
- [Identity and login](#identity-and-login)
- [Per-user isolation](#per-user-isolation)
- [End-to-end encryption of budgets](#end-to-end-encryption-of-budgets)
- [NZ bank sync (Akahu) security](#nz-bank-sync-akahu-security)
- [Network and hosting](#network-and-hosting)
- [Data retention and deletion](#data-retention-and-deletion)
- [Transparency](#transparency)
- [Known limitations and hardening roadmap](#known-limitations-and-hardening-roadmap)
- [Reporting a vulnerability](#reporting-a-vulnerability)

## Summary

- The service is standard [Actual Budget](https://actualbudget.org) plus a small,
  public overlay: privacy-preserving sign-in, a deny-by-default admin gateway, a
  one-click sign-in deep link, and (dormant) **per-user** NZ bank sync via Akahu.
  Everything else is unmodified upstream Actual.
- **Bank sync is optional.** The app is fully usable with manual statement import and
  no bank connection at all. See
  [about-this-service.md](about-this-service.md#you-do-not-need-to-connect-a-bank).
- Login is delegated to a specialist identity provider over OpenID Connect; **the
  service never receives or stores user passwords.**
- **No plaintext email is stored.** Each user is keyed on an irreversible
  `HMAC-SHA256(verified_email, secret)` token and the display-name column is stored
  empty, so no column in the account database holds a recoverable email or name. This
  is enforced by automated tests in CI, not only asserted here.
- Each user's budget and any bank connection are isolated to that user.
- Akahu access is **read-only**, **per-user via OAuth**, and the resulting token is
  **encrypted at rest**.
- Access is restricted to New Zealand and served only over HTTPS.

## Architecture

```
        NZ user's browser
              |
   (Cloudflare: NZ-only geoblock, TLS, rate limiting)
              |
   +----------+------------------------+
   |                                   |
app.trackie.nz                     auth.trackie.nz (self-hosted Logto)
[Actual sync-server + NZ overlay]  [login, email verification, optional MFA]
   |  OpenID multi-user mode
   |  per-user budget files
   |  akahu_connections (encrypted tokens)
              |
        Akahu API (oauth.akahu.nz)  <- read-only, per-user OAuth
```

The identity provider owns "who can log in" (sign-up, email verification, optional
MFA). Actual owns budgets and creates a local user the first time someone logs in.
The NZ overlay adds the Akahu endpoints and the HMAC identity handling below.

## Identity and login

- **OpenID Connect** (`ACTUAL_LOGIN_METHOD=openid`, `ACTUAL_OPENID_ENFORCE=true`).
  Password login is disabled; everyone authenticates through the identity provider.
- **No passwords stored here.** The service never sees a user's password. The provider
  verifies the user and returns only an identity assertion. Email verification and
  bot/abuse detection live at the identity provider.
- **Identity is an HMAC of the verified email, not the raw email.** Upstream Actual stores the user's email address as the ID, we store only an HMAC in the Actual Budget tables to prevent linking budget data to any PII.

## Per-user isolation

- Multi-user OpenID mode gives every person their own `users` row, role, and **own
  budget files**. There is no shared budget.
- **The `/admin` namespace is deny-by-default.** Upstream Actual exposes a user directory
  and file-sharing endpoints under `/admin`; in a multi-tenant deployment those must not be
  reachable by ordinary users. A gateway (`trackieAdminGuard`) sits ahead of the admin router and
  rejects every `/admin` request from a non-admin session, with a single allow-listed
  exception: the unauthenticated owner-created check the login page needs. Any endpoint a
  future upstream release adds under `/admin` is therefore closed by default until it is
  consciously allow-listed - so a new upstream feature cannot silently leak across tenants.
- Every bank-sync endpoint derives the acting user from the **validated session**
  (`res.locals.user_id`), never from client-supplied input, so one user can only ever
  read their own Akahu accounts and transactions.
- The per-user Akahu connection row is keyed by the Actual user ID with
  `ON DELETE CASCADE`, so removing a user removes their bank connection.

## End-to-end encryption of budgets

Actual supports optional client-side end-to-end encryption. A user who turns it on
sets a personal encryption password; their budget is encrypted **on their device**
before sync, and the server stores only salted key metadata - it cannot read the
budget contents.

- This is **separate from login** and is the user's choice.
- **There is no password recovery.** If the encryption password is lost, the data
  cannot be decrypted by anyone, including the operator. Onboarding copy states this
  clearly.

## NZ bank sync (Akahu) security

Bank sync is an **opt-in** feature. If a user never connects a bank, none of the
following applies to them and no Akahu data is ever requested on their behalf.

### What is requested, and what it can do

- The connection uses Akahu's OAuth authorisation flow with the **`ENDURING_CONSENT`**
  scope, so transactions can keep importing without re-prompting.
- It is **read-only in practice**: the overlay only ever calls Akahu's *read* endpoints
  (list accounts, list transactions, refresh). **There is no code path that initiates
  payments or transfers.** The service cannot move a user's money.
- The user selects which accounts to share at Akahu; only those are visible.

### The connect/callback flow (hardened)

1. From the onboarding page, the browser calls `POST /akahu/connect` with the user's
   Actual session token **in a header** (`x-actual-token`) - never in a URL, so it
   cannot leak via server logs, proxy logs, or browser history.
2. The server validates the session, mints a **cryptographically random, single-use
   `state`** (32 random bytes), stores it server-side bound to that user with a
   **10-minute expiry**, and returns the Akahu authorisation URL. The browser then
   navigates to Akahu.
3. Akahu redirects back to `GET /akahu/callback?code=...&state=...`. The callback
   carries no session, so it is secured entirely by the `state`: the server accepts it
   only if it matches an **unexpired, unused** row, which it then deletes (single use).
   Unknown, expired, or replayed states are rejected. This prevents an attacker from
   forging a callback or binding a connection to another user's account (CSRF).
4. The server exchanges the code for the user's Akahu token **server-side**, using the
   operator's confidential app secret over TLS. The authorisation code and app secret
   are never exposed to the browser.

### Token storage (encrypted at rest)

- The per-user Akahu access token is stored in the `akahu_connections` table in
  `account.sqlite`, **encrypted with AES-256-GCM**. The key is derived (HKDF-SHA256)
  from the operator's Akahu app secret, which lives **only in the server environment**,
  not in the database.
- Effect: a leaked database file or backup does **not**, on its own, expose any user's
  bank token - an attacker would also need the server's environment secret.
- Tokens are never written to logs.

### Onboarding page protections

- The onboarding page is served with a restrictive `Content-Security-Policy`,
  `X-Frame-Options: DENY` (anti-clickjacking), `X-Content-Type-Options: nosniff`, and
  `Referrer-Policy: no-referrer`.

### What is and is not stored

- **Stored:** the encrypted per-user Akahu token, and a timestamp of when it was
  connected.
- **Not stored separately:** raw bank transactions are fetched on demand and flow into
  the user's own budget file (which the user may additionally end-to-end encrypt). The
  overlay does not keep its own copy of transaction history.

## Network and hosting

- **HTTPS everywhere**, terminated at Cloudflare; TLS to the origin.
- **NZ-only** via a Cloudflare country rule on the app and a post-login rule at the
  identity provider.
- **Rate limiting** at Cloudflare on login and sign-up paths; `ACTUAL_TRUSTED_PROXIES`
  set to Cloudflare ranges so the origin sees real client IPs.
- Self-hosted origin; `account.sqlite` and user budget files are kept on local disk
  with restricted access and regular, privately-held backups.

## Data retention and deletion

- Users can export their full budget at any time (no lock-in) and disconnect any bank
  connection at any time.
- Removing a user removes their budget files and (via cascade) their Akahu connection.
- Dormant/empty accounts may be cleaned up periodically as part of abuse and storage
  management.

## Transparency

The entire diff from upstream Actual Budget is published in this repository and is
intentionally small: privacy sign-in (HMAC identity), the deny-by-default `/admin` gateway,
and the `/get-started` deep link, plus the dormant Akahu multi-user layer (see the repo
[README](../README.md)). There is no analytics, tracking, or telemetry added. Anyone can
read the drop-in modules under `app/overlay/`, the `app/patches/` diffs, and
`app/apply-overlay.sh` to confirm exactly what runs.

## Reporting a vulnerability

If you find a security issue, please report it privately to the operator rather than
opening a public issue, so it can be fixed before disclosure. See
[SECURITY.md](../SECURITY.md) for the disclosure address and scope.
