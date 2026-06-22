# Akahu app submission

Supporting information for an application to Akahu for a **multi-user** app, so that
New Zealanders using this free Actual Budget service can optionally connect their own
bank accounts. This document is written for the Akahu review team. The technical
detail behind it is in [security-and-privacy.md](security-and-privacy.md).

## Contents

- [The applicant](#the-applicant)
- [What the app does](#what-the-app-does)
- [Who the users are](#who-the-users-are)
- [Scopes requested and why](#scopes-requested-and-why)
- [What data we access and how often](#what-data-we-access-and-how-often)
- [How user data is handled and stored](#how-user-data-is-handled-and-stored)
- [Security measures](#security-measures)
- [User consent and control](#user-consent-and-control)
- [Privacy posture](#privacy-posture)
- [Support and incident response](#support-and-incident-response)
- [Technical reference](#technical-reference)
- [Open items to confirm with Akahu](#open-items-to-confirm-with-akahu)

## The applicant

- **Operator:** Alan Grainger (individual).
- **Service name:** Trackie.
- **Public site:** [trackie.nz](https://trackie.nz).
- **Nature:** non-commercial, free community service. No advertising, no data sale, no
  analytics. Run at the operator's own cost.

**Track record.** I have built several privacy and security-focused open-source
apps and have a multi-year history of running a free hosted service responsibly:

- [Immich Public Proxy](https://github.com/alangrainger/immich-public-proxy) - a widely-used, security-focused proxy for safely sharing photos from a private Immich instance without exposing it to the internet.
- [Share Note](https://github.com/alangrainger/share-note) - a free, open-source, end-to-end-encrypted (AES-GCM) note-sharing service, run at no charge since 2022 (Millions of hits: [live usage stats](https://share.note.sx/stats)).

This is directly relevant to this application: it demonstrates real experience
operating a free, privacy-respecting service over several years and handling user
data with end-to-end encryption - the same posture being applied here.

**Motivation.** I am a long-time participant in the open-source and personal-finance / FIRE communities and have used budgeting software for decades (YNAB, then Actual Budget). Trackie is explicitly a give-back project, not a commercial venture.

**Longevity and capacity.** Share Note has run for free since 2022 and, as of mid-2026,
serves around 2.5 million requests per month and around 125 GB of data across 200,000+ shared notes ([live stats](https://share.note.sx/stats)) - funded entirely by me,
with no advertising, paywalls, or feature-gating, and no intention to introduce any.
This is evidence both of the technical capacity to run a service reliably at scale
and of a sustained commitment to keeping community services free over the long term -
relevant assurance that an Akahu-connected service here would be operated responsibly
and would not disappear or pivot to monetising user data.

## What the app does

Trackie ([trackie.nz](https://trackie.nz)) is a hosted instance of [Actual Budget](https://actualbudget.org), an open-source personal budgeting application, offered free to people in New Zealand. Each user gets their own private
budget.

Akahu is used for one purpose only: to let a user **optionally** import their own bank
**transactions and balances** into their own budget automatically, instead of
uploading statements by hand. Bank connection is strictly opt-in; the app is fully
functional without it.

The integration is **per-user**: each user authorises Akahu independently via OAuth
and receives their own user token. There is no shared or pooled access to anyone's
bank data.

## Who the users are

- Members of the New Zealand public who choose to sign up. Access is geographically
  restricted to New Zealand.
- Expected scale: starts at a handful of users and may grow into the thousands if the
  service becomes popular. The per-user token model is designed for that.
- Each user connects only their own accounts, for their own budgeting.

## Scopes requested and why

- **`ENDURING_CONSENT`** - requested so that, once a user connects, their transactions
  continue to import over time without re-authenticating for every refresh. This is
  core to the "set and forget" budgeting experience.
- **Read-only use.** The app only calls Akahu read endpoints (list accounts, list
  transactions, refresh). **We do not request and do not use any payment or
  money-movement capability.** There is no code path in the application that can
  initiate a transfer or payment - this is verifiable in the public source.

## What data we access and how often

- **Accounts:** name, type, masked number, balance - to show the user their connected
  accounts and to attach balances to their budget.
- **Transactions:** date, amount, description/merchant/particulars/code/reference - to
  import into the user's budget.
- **Frequency:** on demand when the user opens or syncs their budget, with a built-in
  throttle (an account is refreshed at most about once per hour). We do not poll
  continuously.
- We request only the data needed to populate a budget; no wider access is sought.

## How user data is handled and stored

- **Per-user token:** stored server-side in the app's database, **encrypted at rest**
  (AES-256-GCM; key derived from an environment secret, not stored in the database).
- **Transactions/balances:** fetched on demand and written into the user's own budget
  file. The user may additionally apply end-to-end encryption to that budget, in which
  case the server cannot read its contents. The integration keeps no separate copy of
  transaction history.
- **No secondary use:** bank data is used solely to populate the user's budget. It is
  never sold, shared, used for advertising, or processed for analytics.
- **Isolation:** every request is scoped to the authenticated user, so no user can
  access another user's accounts or transactions.

## Security measures

Full detail in [security-and-privacy.md](security-and-privacy.md). In brief:

- OAuth connect/callback protected by a cryptographically random, single-use,
  server-side, time-limited `state` (CSRF protection); confidential server-side code
  exchange (app secret never reaches the browser).
- Session tokens passed in headers, never in URLs.
- Per-user Akahu tokens encrypted at rest; never logged.
- Onboarding page served with CSP, anti-clickjacking, nosniff, and no-referrer headers.
- HTTPS everywhere; NZ-only access; rate limiting at the edge.
- Login handled by a self-hosted identity provider (Logto) with passwordless email
  verification; the service never sees user passwords.
- The full source overlay is public and auditable.

## User consent and control

- The user explicitly initiates the connection, logs in at Akahu, and **chooses which
  accounts to share**.
- The user can **disconnect at any time** from within the service, which deletes the
  stored token and stops all imports immediately.
- Removing a user account removes the associated Akahu connection automatically.

## Privacy posture

The service is designed around data minimisation and purpose limitation, consistent
with the principles of the New Zealand Privacy Act 2020: collect only what is needed
to provide budgeting, use it only for that purpose, keep it secure, and let users
access, export, and delete their data. See [Privacy Policy](https://trackie.nz/privacy/).

## Technical reference

- **OAuth authorisation endpoint:** `https://oauth.akahu.nz`
- **Redirect/callback URI to register:** `https://app.trackie.nz/akahu/callback`
  (the Actual app runs on the `app` subdomain; the apex `trackie.nz` serves the
  static landing page)
- **Token exchange:** server-side `POST https://oauth.akahu.nz/token` with the app
  credentials.
- **App credentials** (`ACTUAL_AKAHU_APP_TOKEN`, `ACTUAL_AKAHU_APP_SECRET`) are held
  only in the server environment.
- **Public source:** this repository - see the overlay under
  `app/overlay/packages/sync-server/src/app-akahu/` and the
  [README](../README.md).

## Open items to confirm with Akahu

- The callback host is `app.trackie.nz` (the Actual app's subdomain), so the callback
  URI to register is `https://app.trackie.nz/akahu/callback`.
- Whether Akahu supports/enforces PKCE on the authorisation flow (we are happy to add
  it if so).
- Branding/display-name for the consent screen - proposed **"Trackie"**.
- Any additional review, rate, or data-handling requirements for a multi-user app at
  the expected scale.
