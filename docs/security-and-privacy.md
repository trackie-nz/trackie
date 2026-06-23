# Security and privacy

How Trackie ([trackie.nz](https://trackie.nz)) is built to protect users' financial
data: the architecture, the trust model, and the specific measures around login, data
isolation, and NZ bank sync. Written for technically-minded users.

## Contents

- [Summary](#summary)
- [Architecture](#architecture)
- [Identity and login](#identity-and-login)
- [Per-user isolation](#per-user-isolation)
- [End-to-end encryption of budgets](#end-to-end-encryption-of-budgets)
- [Network and hosting](#network-and-hosting)
- [Data retention and deletion](#data-retention-and-deletion)
- [Transparency](#transparency)
- [Known limitations and hardening roadmap](#known-limitations-and-hardening-roadmap)
- [Reporting a vulnerability](#reporting-a-vulnerability)

## Summary

- The service is standard [Actual Budget](https://actualbudget.org) plus a small,
  public overlay: privacy-preserving sign-in, a deny-by-default admin gateway, a
  one-click sign-in deep link.
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
```

The identity provider owns "who can log in" (sign-up, email verification, optional
MFA). Actual owns budgets and creates a local user the first time someone logs in.
The NZ overlay adds the HMAC identity handling below.

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

## End-to-end encryption of budgets

Actual supports optional client-side end-to-end encryption. A user who turns it on
sets a personal encryption password; their budget is encrypted **on their device**
before sync, and the server stores only salted key metadata - it cannot read the
budget contents.

- This is **separate from login** and is the user's choice.
- **There is no password recovery.** If the encryption password is lost, the data
  cannot be decrypted by anyone, including the operator. Onboarding copy states this
  clearly.

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
- Removing a user removes their budget files.
- Dormant/empty accounts may be cleaned up periodically as part of abuse and storage
  management.

## Transparency

The entire diff from upstream Actual Budget is published in this repository and is
intentionally small: privacy sign-in (HMAC identity), the deny-by-default `/admin` gateway,
and the `/get-started` deep link. There is no analytics, tracking, or telemetry added. Anyone can
read the drop-in modules under `app/overlay/`, the `app/patches/` diffs, and
`app/apply-overlay.sh` to confirm exactly what runs.

## Reporting a vulnerability

If you find a security issue, please report it privately to the operator rather than
opening a public issue, so it can be fixed before disclosure. See
[SECURITY.md](../SECURITY.md) for the disclosure address and scope.
