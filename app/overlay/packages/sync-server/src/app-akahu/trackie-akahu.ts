// @ts-strict-ignore

/*
  TRACKIE per-user Akahu helpers, layered onto upstream's app-akahu.ts by
  patches/akahu-app.patch. Upstream stores ONE app/user token in secretsService
  (admin-only), so every user would share one bank connection. We instead give
  each NZ user their own my.akahu.nz personal tokens, stored per user and
  encrypted at rest. This module owns all of the NEW logic - encryption, per-user
  storage, token validation, and the /tokens set/clear routes - so upstream's
  transaction-processing code stays upstream's and there is nothing to re-sync on
  a version bump. The patch only swaps the token source and mounts the routes
  registered here. Upstream owns the on-demand account refresh from v26.7.0; the
  patch just widens its cap to 20h (upstream ships 1h), which is the frequency
  agreed upon with Josh Daniell from Akahu.
*/
import crypto from 'node:crypto';
import type { Express } from 'express';

import { handleError } from '#app-gocardless/util/handle-error';
import { getAccountDb } from '#account-db';

export type UserTokens = { appToken: string; userToken: string };

const APP_TOKEN_PREFIX = 'app_token_';
const USER_TOKEN_PREFIX = 'user_token_';

/**
 * Derive the AES-256-GCM key that seals stored Akahu tokens at rest.
 *
 * Each user's tokens grant read access to their bank data, so they are never
 * stored in the clear. Tokens are sealed under a key derived (HKDF-SHA256) from
 * ACTUAL_AKAHU_TOKEN_SECRET, which lives only in the server environment - so a
 * leaked database file or backup does not expose any user's bank tokens on its
 * own. If the secret is rotated or lost, stored tokens become undecryptable and
 * are treated as disconnected, so the user simply re-pastes.
 */
function getTokenEncryptionKey(): Buffer {
  const secret = process.env.ACTUAL_AKAHU_TOKEN_SECRET;
  if (!secret) {
    /* Refuse to encrypt/decrypt with an empty key rather than seal tokens under
       a guessable one - surfaces a misconfiguration loudly at first use. */
    throw new Error('ACTUAL_AKAHU_TOKEN_SECRET is not set');
  }
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(secret, 'utf8'),
      Buffer.from('trackie-akahu-token-v1', 'utf8'),
      Buffer.from('akahu-token-encryption', 'utf8'),
      32,
    ),
  );
}

function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getTokenEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    enc.toString('base64url'),
  ].join(':');
}

function decryptToken(stored: string): string {
  const parts = stored.split(':');
  if (parts[0] !== 'v1' || parts.length !== 4) {
    // Not our envelope - refuse rather than trust an unrecognised value.
    throw new Error('akahu token not in expected encrypted format');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getTokenEncryptionKey(),
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Decrypt and return the caller's stored Akahu tokens, or null if not connected. */
export function getUserTokens(userId: string): UserTokens | null {
  const row = getAccountDb().first(
    'SELECT app_token, user_token FROM akahu_connections WHERE user_id = ?',
    [userId],
  );
  if (!row?.app_token || !row?.user_token) return null;
  try {
    return {
      appToken: decryptToken(row.app_token),
      userToken: decryptToken(row.user_token),
    };
  } catch {
    /* Undecryptable (e.g. ACTUAL_AKAHU_TOKEN_SECRET rotated) - treat as
       disconnected so the user simply re-pastes their tokens. */
    return null;
  }
}

function setUserTokens(userId: string, appToken: string, userToken: string): void {
  getAccountDb().mutate(
    `INSERT INTO akahu_connections (user_id, app_token, user_token, connected_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET app_token = excluded.app_token,
                                        user_token = excluded.user_token,
                                        connected_at = excluded.connected_at`,
    [userId, encryptToken(appToken), encryptToken(userToken), Math.floor(Date.now() / 1000)],
  );
}

function removeUserTokens(userId: string): void {
  getAccountDb().mutate('DELETE FROM akahu_connections WHERE user_id = ?', [userId]);
}

/**
 * Validate a pasted token pair before storing. Akahu personal tokens carry
 * stable prefixes (`app_token_…`, `user_token_…`); we reject anything else early
 * with a clear message rather than storing a value that will only fail later.
 */
function validateTokens(appToken: unknown, userToken: unknown): string | null {
  if (typeof appToken !== 'string' || typeof userToken !== 'string') {
    return 'Both an App ID Token and a User Access Token are required';
  }
  if (!appToken.trim() || !userToken.trim()) {
    return 'Both an App ID Token and a User Access Token are required';
  }
  if (!appToken.startsWith(APP_TOKEN_PREFIX)) {
    return 'The App ID Token should start with "app_token_"';
  }
  if (!userToken.startsWith(USER_TOKEN_PREFIX)) {
    return 'The User Access Token should start with "user_token_"';
  }
  return null;
}

/**
 * Mount the per-user token routes on upstream's Akahu app. Called from the patch
 * after `app.use(validateSessionMiddleware)`, so both routes require a valid
 * session and derive the user from `res.locals.user_id`, never from client input.
 */
export function registerTokenRoutes(app: Express): void {
  app.post(
    '/tokens',
    handleError(async (req, res) => {
      const { appToken, userToken } = req.body || {};

      const invalid = validateTokens(appToken, userToken);
      if (invalid) {
        res.send({ status: 'error', data: { error: invalid } });
        return;
      }

      setUserTokens(res.locals.user_id, appToken.trim(), userToken.trim());
      res.send({ status: 'ok' });
    }),
  );

  app.delete(
    '/tokens',
    handleError(async (_req, res) => {
      removeUserTokens(res.locals.user_id);
      res.send({ status: 'ok' });
    }),
  );
}
