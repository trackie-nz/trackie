# Trackie

**Free budgeting software for New Zealand.**

[Trackie](https://trackie.nz) is a hosted deployment of [Actual Budget](https://actualbudget.org) - a fast, private, open-source budgeting app - run free for anyone in Aotearoa. 
No cost, no ads, no data harvesting, New Zealand only.

## About

- **[About this service](docs/about-this-service.md)** - what Trackie is, why it is free, how your data is kept safe.
- **[Security & privacy](docs/security-and-privacy.md)** - the technical detail: identity, per-user isolation, end-to-end encryption, and the per-user, read-only, encrypted NZ bank sync.

## What you get

- **Your own private budget**, created automatically the first time you sign in.
- **Passwordless sign-in** - a one-time code sent to your email. Nothing to remember,
  no password to leak.
- **Optional end-to-end encryption** you control. Turn it on with your own password
  and not even the server can read your budget. (There is no password recovery -
  keep it safe!)
- **No lock-in** - export your full budget any time and take it anywhere.

## Why this repository exists

This is the *actual code* that runs trackie.nz, published in the open so anyone can verify exactly what happens to their financial data. Trackie is standard Actual Budget plus a small, auditable NZ layer.

## Acknowledgements

- Trackie is built on [Actual Budget](https://actualbudget.org) (MIT)
