# About Trackie

A plain-language guide to **Trackie** - the free Actual Budget service for New
Zealand, at [trackie.nz](https://trackie.nz). What it is, why it exists, and how your
information is kept safe.

## Contents

- [You do not need to connect a bank](#you-do-not-need-to-connect-a-bank)
- [What this is](#what-this-is)
- [Why I am hosting this](#why-i-am-hosting-this)
- [Who runs this](#who-runs-this)
- [How you sign up](#how-you-sign-up)
- [How your data is kept safe](#how-your-data-is-kept-safe)
- [Connecting a bank (completely optional)](#connecting-a-bank-completely-optional)
- [If you stop using the service](#if-you-stop-using-the-service)
- [You can check the code yourself](#you-can-check-the-code-yourself)

## You do not need to connect a bank

Trackie works completely on its own. You can run your whole budget by entering
transactions yourself or importing a statement file from your bank - no bank
connection required, ever. Connecting a bank just saves you the typing by importing
transactions automatically. It is entirely optional, stays off until you choose it,
and you can disconnect at any time.

## What this is

Trackie is a free, hosted instance of [Actual Budget](https://actualbudget.org) -
a fast, private, open-source budgeting app - offered to anyone in New Zealand. You
get your own private budget, kept separate from everyone else's. Optionally, you can
link your NZ bank accounts so transactions import automatically.

It is the open-source Actual Budget project. It is not a fork or a clone or a knock-off. The only changes from the standard app are a small, public, auditable layer described below.

## Why I am hosting this

Budgeting is critical when money is tight - yet the good paid apps charge a monthly subscription that's out of reach for the people who need it most. Trackie is free so that cost is never the reason someone can't get on top of their money.

Over the past two decades I have received a huge amount of value from the open-source, FIRE, and personal-finance communities. Trackie is a way to
give some of that back. I was a heavy [YNAB](https://www.ynab.com) user for
many years before they shut down YNAB 4, at which point I moved to Actual Budget.

I think the YNAB 4 / Actual Budget methodology is brilliant, and it helped me get from zero savings to retired. There is no business model for this, no ads, no analytics, no data sale. It is a free service for the community.

## Who runs this

This service is run by [Alan Grainger](https://github.com/alangrainger), who builds privacy and security-focused
open-source software. He is the author of [Immich Public Proxy](https://github.com/alangrainger/immich-public-proxy) - a widely-used, security-focused tool for safely sharing photos from a private Immich server without exposing it to the internet - and of [Share Note](https://github.com/alangrainger/share-note), a free, end-to-end-encrypted note-sharing service he has run at his own cost since 2022 (see the [live stats](https://share.note.sx/stats)).

In other words, this is not a fly-by-night operation. It comes from someone with a
track record of building privacy-respecting tools and running a free service
reliably for years. The same approach - collect as little as possible, encrypt what
matters, keep the code open - drives this project too.

## How you sign up

1. Visit the site (you need to be in New Zealand - see below).
2. Enter your email address and click **Send code**.
3. Check your inbox for a short one-time code and enter it.
4. That is it - your private budget is created automatically. Start budgeting.

There is no password to create or remember. The one-time code sent to your email is
the only credential, and it expires after a few minutes. Your login is handled by a
self-hosted login service running on our own infrastructure in New Zealand - your
email never leaves our servers.

**Why we ask for an email address - and what we do with it:**

Your email address is the only personal information we collect. We want to be upfront
about why it is required, because we thought about this carefully.

There are two reasons. The obvious one is that we need some way to identify your
account so that you, and only you, can get back into it. The less obvious one is
anti-abuse: without email verification, a bot can create thousands of accounts in
seconds, filling the server's disk and making the service unusable for everyone. A
working email inbox - and the ability to receive a code from it - makes that
essentially impractical.

We did consider allowing sign-up with just a username and no email at all, which
would be more private. But without that email check, there is no effective barrier
to automated abuse at scale. The email requirement is not bureaucracy; it is what
keeps this service working and free for real people.

**What we do with it:** we store your email address, and that is all. It is used
only to send login codes and to identify your account. We do not send marketing
emails. We do not share it with anyone, ever. We do not use it for analytics or
profiling. If your account is deleted, your email is deleted with it.

## How your data is kept safe

- **Your budget is private to you.** Every person gets their own separate budget
  files. No other user can see your data, and the design keeps each account isolated.
- **Optional end-to-end encryption.** Actual lets you put a personal encryption
  password on your budget. If you do, your budget is scrambled on your device before
  it ever reaches the server, so not even the operator can read its contents.
  **Important: there is no way to recover this password if you forget it** - keep it
  somewhere safe. (This is separate from your normal login.)
- **New Zealand only.** Access is restricted to people in New Zealand, which keeps
  the service small, local, and easier to run safely.
- **Open and auditable.** The exact code that runs the server is public (see below),
  so anyone can confirm there is no tracking or hidden data collection.

## Connecting a bank (completely optional)

If you want your NZ transactions to import automatically, Trackie connects to your
bank through [Akahu](https://www.akahu.nz/), New Zealand's open-banking service.

- **You use your own Akahu account.** Rather than Trackie holding one big connection
  to everyone's banks, you create your own free account at
  [my.akahu.nz](https://my.akahu.nz), connect your bank there, and paste two personal
  access codes into Trackie. A short in-app guide walks you through every step.
- **It is read-only.** Trackie can only *read* your transactions and balances to bring
  them into your budget. It can never move money or make a payment.
- **Your access codes are encrypted.** Trackie stores your two codes scrambled, not in
  plain text. 
- **It updates politely.** Trackie refreshes a connected account at most once a day,
  and only while you are actually using your budget - never quietly in the background.
- **You stay in control.** Disconnect at any time from the bank-sync settings and your
  stored codes are deleted; removing your account deletes them too.

## If you stop using the service

- You can disconnect any linked bank at any time.
- You own your data: Actual lets you export your full budget whenever you like, so you
  are never locked in. You can take it to your own self-hosted Actual, or anywhere.
- When an account is removed, its data and any bank connection are removed with it.

## You can check the code yourself

You should not have to take any of this on trust. The complete set of changes this
service makes to standard Actual Budget is published in this repository, and it is
deliberately tiny - just the NZ bank-sync layer. Anyone can read it and confirm there
is no analytics, tracking, or hidden behaviour.

For the technical detail of how your data and any bank connection are protected, see
[security-and-privacy.md](security-and-privacy.md).
