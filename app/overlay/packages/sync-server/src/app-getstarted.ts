// @ts-strict-ignore
import express from 'express';

import { getServerHostname, loginWithOpenIdSetup } from '#accounts/openid';

const app = express();
export { app as handlers };

/**
 * Escape a string for safe embedding as a JS string literal inside an inline
 * <script>. The value here is the IdP authorization URL (server-generated, not
 * user input), but we escape defensively so nothing can break out of the
 * literal or close the <script> element.
 */
function jsString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * The interstitial served at GET /get-started.
 *
 * It seeds the web client's persisted server URL into IndexedDB and THEN sends
 * the browser on to the identity provider. See the route handler below for why
 * this is needed; the short version is that a cold /get-started deep-link makes
 * /openid-cb the first SPA page the browser ever loads, so the client never ran
 * the /login or /bootstrap step that normally persists the server URL - and
 * without it, login hangs on a blank screen after the OIDC callback.
 *
 * The web client stores this under IndexedDB: database 'actual', object store
 * 'asyncStorage', keys 'server-url' (origin string) and 'did-bootstrap' (true) -
 * exactly what loot-core's set-server-url handler writes. We write the same keys
 * here so that by the time /openid-cb loads, cold worker init reads server-url
 * and configures the server before getUser() runs. This is a no-op for users who
 * have visited before (the keys are already set). NOTE: this couples to the web
 * client's IndexedDB layout; if upstream changes the db/store/key names this
 * degrades to the original (pre-fix) hang, never to a worse state.
 */
function interstitial(idpUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Signing you in…</title>
</head>
<body>
<p>Signing you in…</p>
<noscript><meta http-equiv="refresh" content="0;url=/login"></noscript>
<script>
(function () {
  var IDP_URL = ${jsString(idpUrl)};
  var ORIGIN = window.location.origin;
  function go() { window.location.replace(IDP_URL); }
  try {
    // Open without a version: opens the existing DB at its current version, or
    // creates it at v1. Creating asyncStorage here is preserved when the web
    // client later opens 'actual' at its own (higher) version and upgrades.
    var req = indexedDB.open('actual');
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('asyncStorage')) {
        db.createObjectStore('asyncStorage');
      }
    };
    req.onerror = go;
    req.onsuccess = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('asyncStorage')) { db.close(); go(); return; }
      try {
        var tx = db.transaction(['asyncStorage'], 'readwrite');
        var store = tx.objectStore('asyncStorage');
        store.put(ORIGIN, 'server-url');
        store.put(true, 'did-bootstrap');
        tx.oncomplete = function () { db.close(); go(); };
        tx.onerror = function () { db.close(); go(); };
      } catch (err) { try { db.close(); } catch (e2) {} go(); }
    };
  } catch (err) { go(); }
})();
</script>
</body>
</html>`;
}

/*
GET /get-started

Server-side kick-off of the OpenID (Logto) login flow. Out of the box Actual
makes a new user load /login and click "Sign in with OpenID" before the browser
is ever sent to the identity provider. This route performs that first step on the
server: loginWithOpenIdSetup() - the exact same function the in-app button
triggers - generates a fresh per-request state + PKCE challenge, stores it in
pending_openid_requests, and returns the provider authorization URL.

Rather than 302 straight to that URL, we serve a tiny interstitial that first
persists the web client's server URL (see interstitial() above) and then
redirects. This is what makes the cold deep-link complete login instead of
hanging on /openid-cb. No session is required (the user is not logged in yet),
and nothing here can read or mutate user data.

returnUrl is fixed to the configured server hostname - where the user lands after
the OIDC callback completes - because isValidRedirectUrl() (enforced inside
loginWithOpenIdSetup) only accepts a URL on the server's own host.

Any failure falls back to the normal /login page rather than surfacing an error,
so a misconfiguration degrades to the standard two-click flow.
*/
app.get('/', async (_req, res) => {
  try {
    const { error, url } = await loginWithOpenIdSetup(getServerHostname());
    if (error || !url) {
      console.error('[get-started] openid setup failed:', error);
      res.redirect('/login');
      return;
    }
    // Allow this one page's inline seeding script. Set explicitly so the page
    // works regardless of where the global CSP middleware sits in the chain.
    res
      .set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'unsafe-inline'; base-uri 'none'",
      )
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(interstitial(url));
  } catch (err) {
    console.error('[get-started] unexpected error:', err);
    res.redirect('/login');
  }
});
