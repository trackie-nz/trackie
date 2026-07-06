/*
  Client code verification - shared core.

  This is the one place that (a) hashes a file and (b) decides whether the bytes
  your browser was served match Trackie's published, open-source build. It is
  imported by all three callers, so they can never drift apart:

    - generate-manifest.js   builds manifest.json in CI (hashes each build file)
    - index.html             the verifier page (hashes each response in your HAR)
    - verify-core.test.js    the test

  No dependencies and no build step: plain ES modules and the Web Crypto API,
  which behaves identically in the browser and in Node. It is meant to be read top
  to bottom - that readability is the whole point of the tool.

  Manifest format (what generate-manifest.js writes and the verifier checks):

    {
      "version": "26.7.0-trackie.3",
      "files": {
        "index.html": "<sha256 hex>",
        "static/js/index.CaWhj7qX.js": "<sha256 hex>",
        "sw.js": "<sha256 hex>"
      }
    }

  Paths are relative to the client build root, using forward slashes.
*/

/** SHA-256 of some bytes (Uint8Array/ArrayBuffer), as a lowercase hex string. */
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/*
  Media types the browser actually executes or applies. These are the only things
  an attacker could change to run different code in your tab, so these are what we
  check. API responses (JSON), images and fonts are data, not code, and are
  skipped - checking them would only add noise.
*/
function isCode(mimeType) {
  const m = (mimeType || '').toLowerCase();
  return (
    m.includes('html') ||
    m.includes('javascript') ||
    m.includes('wasm') ||
    m.includes('css')
  );
}

/*
  The build-relative path a served URL maps to. The server returns index.html for
  the root and for every client-side route, so every HTML document is checked
  against the single index.html in the build. Everything else maps by its path.
*/
function pathForUrl(urlString, mimeType) {
  if ((mimeType || '').toLowerCase().includes('html')) return 'index.html';
  return decodeURIComponent(new URL(urlString).pathname).replace(/^\/+/, '');
}

/*
  The raw bytes of a HAR response body. DevTools stores binary bodies (wasm,
  images) base64-encoded, and text bodies (js, html, css) as plain text.
*/
function bodyBytes(content) {
  if (!content || content.text == null) return null;
  if (content.encoding === 'base64') {
    return Uint8Array.from(atob(content.text), c => c.charCodeAt(0));
  }
  return new TextEncoder().encode(content.text);
}

/** The origin that served the HTML document - the app we are checking. */
function originOfDocument(entries) {
  const doc = entries.find(e =>
    (e.response?.content?.mimeType || '').toLowerCase().includes('html'),
  );
  return doc ? new URL(doc.request.url).origin : null;
}

/*
  Check a HAR (your real browser session, saved from DevTools) against a manifest
  (the published build). Returns a plain report that the page and the test both
  render. Each checked response is sorted into one bucket:

    match       - byte-identical to the published build
    modified    - same path, different bytes (the file was changed)
    unexpected  - code served by the app that is not in the build at all (injected)
    unreadable  - the HAR did not include this response's body, so we can't tell
    third-party - code from another origin (usually your own browser extensions)

  `ok` is true only if every code file the app served is a match, nothing extra
  was served, and index.html itself matched.
*/
export async function verifyHar(har, manifest) {
  const entries = har?.log?.entries ?? [];
  const appOrigin = originOfDocument(entries);

  const results = [];
  for (const entry of entries) {
    const url = entry.request?.url;
    const mimeType = entry.response?.content?.mimeType;
    if (!url || !isCode(mimeType)) continue;

    if (new URL(url).origin !== appOrigin) {
      results.push({ url, kind: 'third-party' });
      continue;
    }

    const path = pathForUrl(url, mimeType);
    const bytes = bodyBytes(entry.response.content);
    if (!bytes) {
      results.push({ url, path, kind: 'unreadable' });
      continue;
    }

    const got = await sha256Hex(bytes);
    const expected = manifest.files[path];
    if (!expected) results.push({ url, path, kind: 'unexpected', got });
    else if (expected === got) results.push({ url, path, kind: 'match' });
    else results.push({ url, path, kind: 'modified', got, expected });
  }

  const modified = results.filter(r => r.kind === 'modified');
  const unexpected = results.filter(r => r.kind === 'unexpected');
  const sawIndex = results.some(r => r.path === 'index.html' && r.kind === 'match');
  const ok = modified.length === 0 && unexpected.length === 0 && sawIndex;

  return { appOrigin, ok, sawIndex, results };
}
