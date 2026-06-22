# Security policy

Trackie holds people's financial data, so security is taken seriously. The full
security and privacy model - identity, per-user isolation, end-to-end encryption, and
the hardened bank-connect flow - is documented in
[docs/security-and-privacy.md](docs/security-and-privacy.md).

## Reporting a vulnerability

Please report security issues **privately** rather than opening a public issue, so
they can be fixed before public disclosure.

- **Security contact:** [Send an advisory through Github](https://github.com/alangrainger/trackie/security/advisories)

When reporting, please include enough detail to reproduce the issue (affected
endpoint or page, steps, and impact). You will get an acknowledgement, updates as the
issue is worked, and credit on disclosure if you would like it.

## Scope

In scope: the code in this repository (the NZ overlay, the build, and the compose
stack) as it runs on [trackie.nz](https://trackie.nz).

Upstream [Actual Budget](https://github.com/actualbudget/actual) issues should be
reported to that project. If you are unsure where a problem belongs, report it here
and it will be routed appropriately.
