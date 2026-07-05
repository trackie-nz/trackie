/*
  Tests for the verification core. Self-contained: it builds a tiny fake build +
  manifest and a matching HAR from bytes defined here, so it runs anywhere with no
  fixtures. It proves the check passes on a clean session and - crucially - FAILS
  when a file is modified or extra code is injected.

  Run: node --test verify/verify-core.test.js
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyHar, sha256Hex } from './verify-core.js';

const enc = new TextEncoder();
const base64 = bytes => Buffer.from(bytes).toString('base64');

const APP = 'https://app.example.nz';
const indexHtml = '<!doctype html><script src="/static/app.js"></script>';
const appJs = 'console.log("hello")';
const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]); // "\0asm" header

/** A manifest describing the honest build above. */
async function goodManifest() {
  return {
    version: 'test',
    files: {
      'index.html': await sha256Hex(enc.encode(indexHtml)),
      'static/app.js': await sha256Hex(enc.encode(appJs)),
      'sql.wasm': await sha256Hex(wasm),
    },
  };
}

function entry(url, mimeType, text, encoding) {
  const content = { mimeType, text };
  if (encoding) content.encoding = encoding;
  return { request: { url }, response: { content } };
}

/** A HAR of an honest page load of the build above. */
function goodHar() {
  return {
    log: {
      entries: [
        entry(`${APP}/`, 'text/html', indexHtml),
        entry(`${APP}/static/app.js`, 'application/javascript', appJs),
        entry(`${APP}/sql.wasm`, 'application/wasm', base64(wasm), 'base64'),
        // A data/API response - not code, must be ignored:
        entry(`${APP}/sync`, 'application/json', '{"ok":true}'),
      ],
    },
  };
}

test('clean session passes', async () => {
  const report = await verifyHar(goodHar(), await goodManifest());
  assert.equal(report.ok, true);
  assert.equal(report.sawIndex, true);
  assert.equal(report.appOrigin, APP);
  assert.ok(report.results.filter(r => r.kind === 'match').length === 3);
});

test('a modified file fails', async () => {
  const har = goodHar();
  har.log.entries[1].response.content.text = appJs + '\n/* injected */';
  const report = await verifyHar(har, await goodManifest());
  assert.equal(report.ok, false);
  assert.ok(report.results.some(r => r.kind === 'modified' && r.path === 'static/app.js'));
});

test('injected extra code from the app origin fails', async () => {
  const har = goodHar();
  har.log.entries.push(entry(`${APP}/static/evil.js`, 'application/javascript', 'steal()'));
  const report = await verifyHar(har, await goodManifest());
  assert.equal(report.ok, false);
  assert.ok(report.results.some(r => r.kind === 'unexpected' && r.path === 'static/evil.js'));
});

test('third-party script is flagged but does not by itself fail a clean build', async () => {
  const har = goodHar();
  har.log.entries.push(entry('https://cdn.other.com/x.js', 'application/javascript', 'x'));
  const report = await verifyHar(har, await goodManifest());
  assert.equal(report.ok, true);
  assert.ok(report.results.some(r => r.kind === 'third-party'));
});

test('a session with no index.html document does not pass', async () => {
  const har = { log: { entries: [entry(`${APP}/static/app.js`, 'application/javascript', appJs)] } };
  const report = await verifyHar(har, await goodManifest());
  assert.equal(report.ok, false);
  assert.equal(report.sawIndex, false);
});
