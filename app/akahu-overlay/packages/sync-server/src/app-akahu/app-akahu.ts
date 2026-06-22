// @ts-strict-ignore
import { AkahuClient } from 'akahu';
import type {
  Account,
  CurrencyConversion,
  EnrichedTransaction,
  PendingTransaction,
  Transaction,
} from 'akahu';
import type { EnrichedPendingTransaction } from 'akahu/dist/models/transactions';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleError } from '#app-gocardless/util/handle-error';
import { getAccountDb } from '#account-db';
import { config } from '#load-config';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '#util/middlewares';
import { createMutex } from '#util/mutex';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Per-user token helpers (stored in akahu_connections table)
// ---------------------------------------------------------------------------

function getUserToken(userId: string): string | null {
  const row = getAccountDb().first(
    'SELECT user_token FROM akahu_connections WHERE user_id = ?',
    [userId],
  );
  if (!row?.user_token) return null;
  try {
    return decryptToken(row.user_token);
  } catch {
    // Undecryptable (e.g. the operator rotated the Akahu app secret the key is
    // derived from) - treat as disconnected so the user simply re-links.
    return null;
  }
}

function setUserToken(userId: string, userToken: string): void {
  getAccountDb().mutate(
    `INSERT INTO akahu_connections (user_id, user_token, connected_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET user_token = excluded.user_token,
                                        connected_at = excluded.connected_at`,
    [userId, encryptToken(userToken), Math.floor(Date.now() / 1000)],
  );
}

function removeUserToken(userId: string): void {
  getAccountDb().mutate(
    'DELETE FROM akahu_connections WHERE user_id = ?',
    [userId],
  );
}

// ---------------------------------------------------------------------------
// Encryption of stored Akahu tokens (at rest, in account.sqlite)
// ---------------------------------------------------------------------------
// Each user's Akahu access token grants read access to their bank data, so it is
// never stored in the clear. Tokens are sealed with AES-256-GCM under a key
// derived (HKDF-SHA256) from the operator's Akahu app secret, which lives only in
// the server environment - so a leaked database file or backup does not expose
// any user's bank token on its own.

function getTokenEncryptionKey(): Buffer {
  const appSecret = config.get('akahu.appSecret') || '';
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(appSecret, 'utf8'),
      Buffer.from('actual-nz-akahu-token-v1', 'utf8'),
      Buffer.from('akahu-user-token-encryption', 'utf8'),
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

// ---------------------------------------------------------------------------
// OAuth state (CSRF protection for the connect -> callback round-trip)
// ---------------------------------------------------------------------------
// /connect mints a random, single-use state bound to the authenticated user and
// stores it server-side; /callback (which carries no session) accepts a state
// only if it matches an unexpired, unused row. This stops an attacker forging a
// callback or binding a bank connection to someone else's account.

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function createOAuthState(userId: string): string {
  const state = crypto.randomBytes(32).toString('base64url');
  getAccountDb().mutate(
    `INSERT INTO akahu_oauth_states (state, user_id, created_at) VALUES (?, ?, ?)`,
    [state, userId, Date.now()],
  );
  return state;
}

function consumeOAuthState(state: string): string | null {
  const row = getAccountDb().first(
    'SELECT user_id, created_at FROM akahu_oauth_states WHERE state = ?',
    [state],
  );
  // Single-use: drop the matched row, and opportunistically clear expired ones.
  getAccountDb().mutate('DELETE FROM akahu_oauth_states WHERE state = ?', [state]);
  getAccountDb().mutate(
    'DELETE FROM akahu_oauth_states WHERE created_at < ?',
    [Date.now() - OAUTH_STATE_TTL_MS],
  );
  if (!row) return null;
  if (Date.now() - row.created_at > OAUTH_STATE_TTL_MS) return null;
  return row.user_id;
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);

// ---------------------------------------------------------------------------
// OAuth flow - /akahu/connect and /akahu/callback
// /connect is called from the onboarding page with the user's Actual session
// token in the x-actual-token header (never in the URL, so it cannot leak via
// server logs or browser history). It returns the Akahu authorisation URL as
// JSON and the browser navigates there. /callback carries no session, so it is
// secured by the single-use, server-side OAuth state minted in /connect.
// ---------------------------------------------------------------------------

// POST /akahu/connect   (auth: Actual session via x-actual-token header)
// Mints a CSRF state and returns the Akahu OAuth authorisation URL.
app.post(
  '/connect',
  validateSessionMiddleware,
  handleError(async (_req, res) => {
    const appToken = config.get('akahu.appToken');
    const serverHostname = config.get('openId.server_hostname') || `http://localhost:${config.get('port')}`;

    if (!appToken) {
      res.status(503).send({
        status: 'error',
        reason: 'akahu-not-configured',
      });
      return;
    }

    const userId = res.locals.user_id;
    const state = createOAuthState(userId);

    const callbackUrl = new URL('/akahu/callback', serverHostname).toString();
    const authUrl = new URL('https://oauth.akahu.nz');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', appToken);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('scope', 'ENDURING_CONSENT');
    authUrl.searchParams.set('state', state);

    res.send({ status: 'ok', data: { authUrl: authUrl.toString() } });
  }),
);

// GET /akahu/callback?code=...&state=...
// Exchanges the authorisation code for a user token and stores it.
app.get(
  '/callback',
  handleError(async (req, res) => {
    const { code, state, error: oauthError } = req.query as Record<string, string>;
    const serverHostname = config.get('openId.server_hostname') || `http://localhost:${config.get('port')}`;

    if (oauthError) {
      res.redirect(`/akahu/onboard?error=${encodeURIComponent(oauthError)}`);
      return;
    }

    if (!code || !state) {
      res.status(400).send({ status: 'error', reason: 'missing-code-or-state' });
      return;
    }

    const userId = consumeOAuthState(state);
    if (!userId) {
      // Unknown, expired or already-used state - reject as a possible forgery.
      res.redirect('/akahu/onboard?error=invalid-or-expired-request');
      return;
    }

    const appToken = config.get('akahu.appToken');
    const appSecret = config.get('akahu.appSecret');
    const callbackUrl = new URL('/akahu/callback', serverHostname).toString();

    // Exchange the authorisation code for a user access token.
    let userToken: string;
    try {
      const tokenRes = await fetch('https://oauth.akahu.nz/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: callbackUrl,
          client_id: appToken,
          client_secret: appSecret,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        console.error('Akahu token exchange failed:', tokenRes.status, body);
        res.redirect('/akahu/onboard?error=token-exchange-failed');
        return;
      }

      const tokenJson = (await tokenRes.json()) as { access_token: string };
      userToken = tokenJson.access_token;
    } catch (err) {
      console.error('Akahu token exchange error:', err);
      res.redirect('/akahu/onboard?error=token-exchange-error');
      return;
    }

    setUserToken(userId, userToken);

    res.redirect('/akahu/onboard?connected=1');
  }),
);

// GET /akahu/onboard
// Serves the self-contained HTML onboarding page.
app.get(
  '/onboard',
  handleError(async (req, res) => {
    const htmlPath = path.join(__dirname, 'onboard.html');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Security headers for the only HTML page this overlay serves.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    res.sendFile(htmlPath);
  }),
);

// ---------------------------------------------------------------------------
// Authenticated endpoints - require a valid Actual session token
// ---------------------------------------------------------------------------

app.use(validateSessionMiddleware);

// POST /akahu/status
// Returns whether the calling user has an Akahu connection.
app.post(
  '/status',
  handleError(async (_req, res) => {
    const appToken = config.get('akahu.appToken');
    const userToken = getUserToken(res.locals.user_id);

    res.send({
      status: 'ok',
      data: {
        configured: !!(appToken && userToken),
        appConfigured: !!appToken,
      },
    });
  }),
);

// DELETE /akahu/connection
// Removes the calling user's Akahu connection.
app.delete(
  '/connection',
  handleError(async (_req, res) => {
    removeUserToken(res.locals.user_id);
    res.send({ status: 'ok' });
  }),
);

// POST /akahu/accounts
// Lists the NZ bank accounts the calling user has connected via Akahu.
app.post(
  '/accounts',
  handleError(async (_req, res) => {
    const userToken = getUserToken(res.locals.user_id);
    const appToken = config.get('akahu.appToken');

    if (!userToken || !appToken) {
      res.send({
        status: 'ok',
        data: {
          error: 'Not connected to Akahu. Visit /akahu/onboard to connect.',
        },
      });
      return;
    }

    try {
      const akahu = new AkahuClient({ appToken });
      const accounts = await akahu.accounts.list(userToken);

      res.send({
        status: 'ok',
        data: { accounts },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      res.send({ status: 'error', data: { error: errorMessage } });
    }
  }),
);

// POST /akahu/transactions
// Fetches transactions for one of the calling user's connected accounts.
app.post(
  '/transactions',
  handleError(async (req, res) => {
    const { accountId, startDate } = req.body || {};

    if (!accountId || !startDate) {
      return res.send({
        status: 'error',
        data: { error: 'accountId and startDate are required' },
      });
    }

    const userToken = getUserToken(res.locals.user_id);
    const appToken = config.get('akahu.appToken');

    if (!userToken || !appToken) {
      res.send({
        status: 'ok',
        data: {
          error: 'Not connected to Akahu. Visit /akahu/onboard to connect.',
        },
      });
      return;
    }

    try {
      const akahu = new AkahuClient({ appToken });

      const account = await getRefreshedAccount(akahu, userToken, accountId);
      if (!account) {
        return res.send({
          status: 'error',
          data: { error: 'Account not found' },
        });
      }

      if (!account.balance) {
        return res.send({
          status: 'error',
          data: { error: 'Account balance unavailable' },
        });
      }

      const now = new Date();
      const endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1,
      ).toISOString();

      const transactions: Transaction[] = [];
      let cursor = undefined;
      do {
        const { items, cursor: nextCursor } =
          await akahu.accounts.listTransactions(userToken, accountId, {
            start: new Date(startDate).toISOString(),
            end: endDate,
            cursor,
          });

        transactions.push(...items);
        cursor = nextCursor && nextCursor.next ? nextCursor.next : undefined;
      } while (cursor);

      const pendingTransactions = await akahu.accounts.listPendingTransactions(
        userToken,
        accountId,
      );

      const date = getDate(
        account.refreshed?.balance
          ? new Date(account.refreshed.balance)
          : new Date(),
      );
      const currentBalance = convertToCents(account.balance.current);

      const balances = [
        {
          balanceAmount: {
            amount: currentBalance,
            currency: account.balance.currency,
          },
          balanceType: 'expected',
          referenceDate: date,
        },
      ];

      if (account.balance.available) {
        balances.push({
          balanceAmount: {
            amount: convertToCents(account.balance.available),
            currency: account.balance.currency,
          },
          balanceType: 'interimAvailable',
          referenceDate: date,
        });
      }

      const startDateObj = new Date(startDate);
      const all = [];
      const booked = [];
      const pending = [];

      for (const trans of transactions) {
        if (new Date(trans.date) >= startDateObj) {
          const processedTrans = processTransaction(trans, account);
          booked.push(processedTrans);
          all.push(processedTrans);
        }
      }

      for (const trans of pendingTransactions) {
        if (new Date(trans.date) >= startDateObj) {
          const processedTrans = processPendingTransaction(trans, account);
          pending.push(processedTrans);
          all.push(processedTrans);
        }
      }

      const sortFunction = (a: AkahuTransaction, b: AkahuTransaction) =>
        b.sortOrder - a.sortOrder;

      res.send({
        status: 'ok',
        data: {
          balances,
          startingBalance: currentBalance,
          transactions: {
            all: all.sort(sortFunction),
            booked: booked.sort(sortFunction),
            pending: pending.sort(sortFunction),
          },
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      res.send({
        status: 'error',
        data: { error: 'Failed to fetch transactions: ' + errorMessage },
      });
    }
  }),
);

// ---------------------------------------------------------------------------
// Internal helpers (unchanged from original)
// ---------------------------------------------------------------------------

type AkahuTransaction = {
  booked: boolean;
  date: string;
  payeeName: string;
  notes: string;
  category?: string;
  transactionId?: string;
  sortOrder: number;
  transactionAmount: { amount: number; currency: string };
  merchant?: { name: string; website?: string };
  meta?: {
    particulars?: string;
    code?: string;
    reference?: string;
    other_account?: string;
    conversion?: CurrencyConversion;
    logo?: string;
    card_suffix?: string;
  };
};

const runRefresh = createMutex();

function getRefreshedAccount(
  akahu: AkahuClient,
  userToken: string,
  accountId: string,
): Promise<Account | null> {
  return runRefresh(async () => {
    let account = await akahu.accounts.get(userToken, accountId);
    if (!account) return null;
    if (!shouldRefreshAccount(account.refreshed?.transactions)) return account;

    await akahu.accounts.refreshAll(userToken);

    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      account = await akahu.accounts.get(userToken, accountId);
      if (!account) return null;
      if (!shouldRefreshAccount(account.refreshed?.transactions)) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        break;
      }
    }

    return account;
  });
}

const AKAHU_TRANSACTION_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

function shouldRefreshAccount(refreshedAt?: string) {
  if (!refreshedAt) return false;
  const t = Date.parse(refreshedAt);
  return Number.isFinite(t) && Date.now() - t > AKAHU_TRANSACTION_REFRESH_INTERVAL_MS;
}

const dateTimeFormatNZ = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Pacific/Auckland',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getDate(date: Date): string {
  const parts = dateTimeFormatNZ.formatToParts(date);
  const month = parts[0].value;
  const day = parts[2].value;
  const year = parts[4].value;
  return `${year}-${month}-${day}`;
}

function convertToCents(amount: number): number {
  return Math.round(amount * 100);
}

type AnyTransaction =
  | Transaction
  | EnrichedTransaction
  | PendingTransaction
  | EnrichedPendingTransaction;

function getPayeeName(trans: AnyTransaction): string {
  return getMerchantName(trans) ?? getOtherAccount(trans) ?? trans.description;
}

function getMerchantName(trans: AnyTransaction): string | undefined {
  if ('merchant' in trans && trans.merchant) return trans.merchant.name;
  return undefined;
}

function getOtherAccount(trans: AnyTransaction): string | undefined {
  if ('meta' in trans && trans.meta) return trans.meta.other_account ?? undefined;
  return undefined;
}

function processPendingTransaction(
  trans: PendingTransaction | EnrichedPendingTransaction,
  account: Account,
): AkahuTransaction {
  const transactionDate = new Date(trans.date);
  return {
    ...trans,
    booked: false,
    date: getDate(transactionDate),
    payeeName: getPayeeName(trans),
    merchant: { name: getOtherAccount(trans) ?? '' },
    notes: trans.description,
    sortOrder: transactionDate.getTime(),
    transactionAmount: {
      amount: Math.round(trans.amount * 100) / 100,
      currency: account.balance?.currency ?? 'NZD',
    },
  };
}

function processTransaction(
  trans: Transaction | EnrichedTransaction,
  account: Account,
): AkahuTransaction {
  let category = undefined;
  if ('category' in trans && trans.category) {
    category = trans.category.name;
  }

  const merchant =
    'merchant' in trans && trans.merchant
      ? trans.merchant
      : { name: getOtherAccount(trans) ?? '' };

  return {
    ...processPendingTransaction(trans, account),
    merchant,
    category,
    booked: true,
    transactionId: trans._id,
  };
}
