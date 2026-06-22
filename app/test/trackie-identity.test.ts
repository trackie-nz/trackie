/*
Unit tests for the privacy-preserving identity derivation. These enforce - in
CI, not just in prose - the security-doc claim that Actual stores no readable
email: the derived identity must be an opaque HMAC, and an unverified or missing
email must never become an identity.

Run: node --experimental-strip-types --test app/test/trackie-identity.test.ts
*/
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveOpenIdIdentity } from '../overlay/packages/sync-server/src/accounts/trackie-identity.ts';

const SECRET = 'test-identity-secret';

test('verified email -> 64-hex HMAC, normalised (trim + lowercase)', () => {
  process.env.ACTUAL_IDENTITY_SECRET = SECRET;
  const a = deriveOpenIdIdentity({ email: 'Bob@Example.com', email_verified: true });
  assert.ok('identity' in a);
  assert.match(a.identity, /^[0-9a-f]{64}$/);

  // Different casing/whitespace + the string 'true' must yield the SAME identity.
  const b = deriveOpenIdIdentity({ email: '  bob@example.com ', email_verified: 'true' });
  assert.deepEqual(b, a);
});

test('the identity leaks no readable PII', () => {
  process.env.ACTUAL_IDENTITY_SECRET = SECRET;
  const r = deriveOpenIdIdentity({ email: 'alice@example.com', email_verified: true });
  assert.ok('identity' in r);
  assert.ok(!r.identity.includes('@'));
  assert.ok(!r.identity.toLowerCase().includes('alice'));
});

test('different emails -> different identities', () => {
  process.env.ACTUAL_IDENTITY_SECRET = SECRET;
  const a = deriveOpenIdIdentity({ email: 'a@example.com', email_verified: true });
  const b = deriveOpenIdIdentity({ email: 'b@example.com', email_verified: true });
  assert.ok('identity' in a && 'identity' in b);
  assert.notEqual(a.identity, b.identity);
});

test('unverified email is rejected', () => {
  process.env.ACTUAL_IDENTITY_SECRET = SECRET;
  assert.deepEqual(deriveOpenIdIdentity({ email: 'bob@example.com', email_verified: false }), {
    error: 'openid-grant-failed: no verified email claim was found',
  });
});

test('missing email is rejected', () => {
  process.env.ACTUAL_IDENTITY_SECRET = SECRET;
  assert.deepEqual(deriveOpenIdIdentity({ email_verified: true }), {
    error: 'openid-grant-failed: no verified email claim was found',
  });
});

test('missing identity secret is rejected (fail closed)', () => {
  delete process.env.ACTUAL_IDENTITY_SECRET;
  assert.deepEqual(deriveOpenIdIdentity({ email: 'bob@example.com', email_verified: true }), {
    error: 'openid-grant-failed: identity-secret-not-configured',
  });
});
