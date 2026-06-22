# Trackie

**Free budgeting for New Zealand.** [Trackie](https://trackie.nz) is a hosted deployment of [Actual Budget](https://actualbudget.org) - a fast, private, open-source budgeting app - run free for anyone in Aotearoa. Sign up with your email, get your own private budget, and optionally sync your NZ bank transactions automatically.

No cost, no ads, no data harvesting, New Zealand only.

## About

- **[About this service](docs/about-this-service.md)** - what Trackie is, why it is free, how your data is kept safe.
- **[Security & privacy](docs/security-and-privacy.md)** - the technical detail: identity, per-user isolation, end-to-end encryption, and the hardened bank-connect flow.

## What you get

- **Your own private budget**, created automatically the first time you sign in.
- **Passwordless sign-in** - a one-time code sent to your email. Nothing to remember,
  no password to leak.
- **Optional end-to-end encryption** you control. Turn it on with your own password
  and not even the server can read your budget. (There is no password recovery -
  keep it safe!)
- **Optional NZ bank sync** via [Akahu](https://akahu.nz) - connect your own accounts
  so transactions import automatically. Entirely opt-in; Trackie works fully with
  manual import (CSV / OFX / QIF / QFX) and no bank connection at all.
- **No lock-in** - export your full budget any time and take it anywhere.

## Why this repository exists

This is the *actual code* that runs trackie.nz, published in the open so anyone can verify exactly what happens to their financial data. No analytics, no tracking, no hidden changes - Trackie is standard Actual Budget plus one small, auditable New Zealand layer to allow multi-user and Akahu sync.

## Acknowledgements

- Trackie is built on [Actual Budget](https://actualbudget.org) (MIT)
- NZ bank sync is powered by [Akahu](https://akahu.nz)
