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
  The raw bytes a HAR stored for a response body. DevTools stores binary bodies
  (wasm, images) base64-encoded and text bodies (js, html, css) as plain text.

  A spec-compliant HAR (Chrome/Edge) stores the DECODED body, so these bytes are
  the file itself. Some browsers instead store the transfer-compressed bytes;
  the matcher below reconciles that rather than mis-reporting it as a change.
*/
function rawBytes(content) {
  if (!content || content.text == null) return null;
  if (content.encoding === 'base64') {
    return Uint8Array.from(atob(content.text), c => c.charCodeAt(0));
  }
  return new TextEncoder().encode(content.text);
}

/** A response header value (case-insensitive), or '' if absent. */
function header(response, name) {
  const h = (response?.headers ?? []).find(x => (x.name || '').toLowerCase() === name);
  return (h?.value || '').toLowerCase().trim();
}

/*
  Does this byte stream carry a compression header we can reverse in the browser?
  gzip and zlib(deflate) start with recognisable magic; brotli does not (and no
  browser can DecompressionStream it). Detecting by magic means we reconcile
  compression even when a HAR omits the Content-Encoding header.
*/
function compressionFormat(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
  // zlib header: byte0 low nibble is 8 (deflate) and the 2-byte header % 31 == 0.
  if (bytes.length >= 2 && (bytes[0] & 0x0f) === 8 &&
      (((bytes[0] << 8) | bytes[1]) % 31) === 0) return 'deflate';
  return null;
}

/** Decompress bytes with the platform DecompressionStream, or null on failure. */
async function inflate(bytes, format) {
  if (typeof DecompressionStream === 'undefined') return null;
  // HTTP "deflate" is ambiguous (zlib-wrapped vs raw); try both.
  const formats = format === 'deflate' ? ['deflate', 'deflate-raw'] : [format];
  for (const f of formats) {
    try {
      const stream = new Response(bytes).body.pipeThrough(new DecompressionStream(f));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      /* not this format - try the next, or give up */
    }
  }
  return null;
}

/*
  A last-resort sanity check, used only when the bytes did not match AND we could
  not reverse the transfer-encoding: do the bytes even LOOK like the decoded file
  they claim to be? Valid UTF-8 for text, the "\0asm" header for wasm. If so, the
  mismatch is real (modified); if not, the HAR handed us a compressed blob we
  cannot read (unreadable) and we must not cry tampering.
*/
function looksDecoded(bytes, mimeType) {
  if ((mimeType || '').toLowerCase().includes('wasm')) {
    return bytes.length >= 4 &&
      bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
  }
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; }
  catch { return false; }
}

/*
  The decoded text of an HTML body, so the page can show WHAT changed (e.g. a
  Cloudflare-injected script) rather than just "modified". Only for HTML - a diff
  of minified JS/wasm would be unreadable noise, so we do not carry it.
*/
function htmlText(bytes, mimeType) {
  if (!(mimeType || '').toLowerCase().includes('html')) return undefined;
  try { return new TextDecoder('utf-8').decode(bytes); } catch { return undefined; }
}

/*
  Sort one code response into a bucket by comparing it to the published hash,
  reversing transfer-compression where we can and failing SAFE where we cannot.
*/
async function classify(entry, expected) {
  const response = entry.response;
  const mimeType = response?.content?.mimeType;
  const raw = rawBytes(response?.content);
  if (!raw) return { kind: 'unreadable' };

  const got = await sha256Hex(raw);
  if (!expected) return { kind: 'unexpected', got };
  if (got === expected) return { kind: 'match' };

  // Mismatch. If the bytes are (or were transferred) compressed, reconcile that
  // before ruling on it - a compressed blob is not evidence of tampering.
  const format = compressionFormat(raw);
  if (format) {
    const inflated = await inflate(raw, format);
    if (inflated) {
      const gotInflated = await sha256Hex(inflated);
      if (gotInflated === expected) return { kind: 'match' };
      // Reversed the compression and it still differs: trust that as 'modified'
      // only if the result looks like the real file, else it is noise.
      return looksDecoded(inflated, mimeType)
        ? { kind: 'modified', got: gotInflated, expected, text: htmlText(inflated, mimeType) }
        : { kind: 'unreadable' };
    }
    // Magic matched but it would not inflate - fall through and judge the raw.
  }

  // Not something we could decompress. If the transfer used an encoding we can't
  // reverse here (e.g. brotli) and the bytes don't look like the real file, we
  // cannot tell - fail safe to 'unreadable'. Otherwise the bytes are the decoded
  // body and genuinely differ: 'modified'.
  const encoded = header(response, 'content-encoding');
  if (encoded && encoded !== 'identity' && !looksDecoded(raw, mimeType)) {
    return { kind: 'unreadable' };
  }
  return { kind: 'modified', got, expected, text: htmlText(raw, mimeType) };
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
    modified    - same path, different bytes (the file was really changed)
    unexpected  - code served by the app that is not in the build at all (injected)
    unreadable  - we could not reconstruct the bytes (no body captured, or a
                  transfer-encoding we cannot reverse here, e.g. brotli) - unknown,
                  NOT proof of tampering
    third-party - code from another origin (usually your own browser extensions)

  A response is only 'modified' when we are confident the decoded bytes differ;
  anything we cannot read fails SAFE to 'unreadable' so a browser quirk never
  masquerades as tampering.

  `ok` (a full pass) is true only if index.html matched, nothing was modified or
  injected, and there was nothing we could not read - i.e. every code file the
  app served was proven identical to the build.
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
    const r = await classify(entry, manifest.files[path]);
    results.push({ url, path, ...r });
  }

  const modified = results.filter(r => r.kind === 'modified');
  const unexpected = results.filter(r => r.kind === 'unexpected');
  const unreadable = results.filter(r => r.kind === 'unreadable');
  const sawIndex = results.some(r => r.path === 'index.html' && r.kind === 'match');
  const indexPresent = results.some(r => r.path === 'index.html');
  const ok = modified.length === 0 && unexpected.length === 0 &&
    unreadable.length === 0 && sawIndex;

  return { appOrigin, ok, sawIndex, indexPresent, results };
}

/*
  Locate the change between the published text and what was served, as a single
  contiguous edit: the shared start, the shared end, and whatever differs in the
  middle. That is exactly the shape of an injection (e.g. Cloudflare adding a
  <script>), so the page can show precisely what was added or removed instead of
  a scary all-or-nothing "modified". `context` trims the unchanged head/tail so
  the reader sees the edit, not the whole file.
*/
export function diffInsertion(expected, served, context = 60) {
  const a = expected ?? '';
  const b = served ?? '';
  let p = 0;
  const max = Math.min(a.length, b.length);
  while (p < max && a[p] === b[p]) p++;
  let s = 0;
  while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return {
    before: b.slice(Math.max(0, p - context), p),
    removed: a.slice(p, a.length - s),
    added: b.slice(p, b.length - s),
    after: b.slice(b.length - s, b.length - s + context),
    truncatedHead: p > context,
    truncatedTail: b.length - s < b.length - context,
  };
}
