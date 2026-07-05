# Client code verification

A small, dependency-free tool that lets anyone check that the app code their
browser was served is byte-for-byte Trackie's public, open-source build - upstream
Actual Budget plus [our small public overlay](../app/patches/README.md), with
nothing added or changed.

It answers the fair question *"how do I know the server isn't sending me a
tampered client that leaks my data?"* - the runtime half of Trackie's
[end-to-end-encryption story](../docs/security-and-privacy.md). (Encryption keeps
the server out of your data; this proves the client doing that encryption wasn't
swapped.)

## How it works

1. **In CI**, right after the client is built, `generate-manifest.js` hashes every
   file in the build and writes `manifest.json` (`{ path: sha256 }`). It is
   published on GitHub Pages next to the verifier and is covered by the release
   image's build-provenance attestation, so the manifest traces back to this
   public repo and workflow.
2. **You** save a HAR of your own session from your browser's DevTools (the browser
   records it, so the app cannot fake it).
3. **The verifier page** (`index.html`, served by GitHub - not by Trackie) hashes
   every code response in your HAR and checks each one against the manifest. It
   passes only if every code file matches, nothing extra was served, and
   `index.html` itself matched.

## Files

| File | Role |
| --- | --- |
| `verify-core.js` | The shared heart: hashing + the match logic. Read this first. |
| `generate-manifest.js` | CI: turns a built client directory into `manifest.json`. |
| `index.html` | The verifier page you open and drop a HAR onto. |
| `verify-core.test.js` | Tests: proves it passes clean and **fails** on tamper/injection. |

All three import the *same* `verify-core.js`, so the thing that builds the
manifest and the thing that checks it can never disagree about how a file is
hashed. There is no build step and no dependencies - it is meant to be audited by
reading it.

## Run the tests

```sh
node --test verify/verify-core.test.js
```

## Generate a manifest locally

```sh
node verify/generate-manifest.js <path-to-client-build> <version> > manifest.json
```

## What it proves - and does not

- **Proves:** for the session you captured, every piece of code the app served you
  is identical to the public build. No hidden logging or exfiltration code was
  slipped into your client.
- **Does not prove:** anything about other sessions or the future (it is a spot
  check - re-run it whenever); anything about the server's own behaviour; and it
  does not cover **bank-sync (Akahu) data**, which by design passes through the
  server. It applies to end-to-end-encrypted budgets. For zero trust, self-host the
  open-source client yourself.
