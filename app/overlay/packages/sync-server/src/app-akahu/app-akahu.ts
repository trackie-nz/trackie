// @ts-strict-ignore

/*
  TRACKIE per-user Akahu bank sync (drop-in replacing upstream's app-akahu.ts).

  Upstream (PR #6041) stores ONE app token + ONE user token as global server
  secrets (secretsService), settable only by an admin - so every user would
  share one person's bank connection. Trackie instead gives each user their own
  my.akahu.nz personal tokens: this router stores both per user (encrypted at
  rest) keyed on the validated session's user id, and every Akahu call uses the
  caller's own tokens. The transaction-processing helpers below are kept verbatim
  from upstream; only token storage, the /tokens routes, encryption and the
  refresh policy are ours.
*/
import { AkahuClient } from 'akahu';
import type {
  Account,
  CurrencyConversion,
  EnrichedTransaction,
  PendingTransaction,
  Transaction,
} from 'akahu';
// For some reason this is not provided in the provided index.d.ts file
import type { EnrichedPendingTransaction } from 'akahu/dist/models/transactions';
import crypto from 'node:crypto';
import { formatISO } from 'date-fns';
import express from 'express';

import { handleError } from '#app-gocardless/util/handle-error';
import { getAccountDb } from '#account-db';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '#util/middlewares';

type AkahuTransaction = {
  booked: boolean;
  date: string;
  payeeName: string;
  notes: string;
  category?: string;
  transactionId?: string;
  sortOrder: number;
  transactionAmount: { amount: number; currency: string };
  merchant?: {
    name: string;
    website?: string;
  };
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

type UserTokens = { appToken: string; userToken: string };

/*
  Encryption of stored Akahu tokens (at rest, in account.sqlite).

  Each user's tokens grant read access to their bank data, so they are never
  stored in the clear. Tokens are sealed with AES-256-GCM under a key derived
  (HKDF-SHA256) from ACTUAL_AKAHU_TOKEN_SECRET, which lives only in the server
  environment - so a leaked database file or backup does not expose any user's
  bank tokens on its own. If the secret is rotated or lost, stored tokens become
  undecryptable and are treated as disconnected, so the user simply re-pastes.
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

// Per-user token storage (akahu_connections table)

/** Decrypt and return the caller's stored Akahu tokens, or null if not connected. */
function getUserTokens(userId: string): UserTokens | null {
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
  if (!appToken.startsWith('app_token_')) {
    return 'The App ID Token should start with "app_token_"';
  }
  if (!userToken.startsWith('user_token_')) {
    return 'The User Access Token should start with "user_token_"';
  }
  return null;
}

/*
  Refresh policy: at most once per 20h per account, on-demand only.

  Sync is driven by the user's own client opening/syncing their budget (no
  background poller). Before reading transactions we ask Akahu to refresh the
  account, but only if its data is older than 20h - the "polite" cap. An active
  user gets fresh data at most daily; a user away two weeks is >20h stale on
  their next login, so their first sync refreshes immediately. The mutex
  serialises refreshes server-wide so concurrent budgets don't stampede Akahu.
*/

const AKAHU_TRANSACTION_REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20 hours

/** Minimal promise-chain mutex (#util/mutex does not exist at our base tag). */
function createMutex() {
  let chain: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = chain.then(task);
    // Keep the chain alive whether the task resolves or rejects.
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

const runRefresh = createMutex();

function shouldRefreshAccount(refreshedAt?: string): boolean {
  if (!refreshedAt) return false;
  const t = Date.parse(refreshedAt);
  return (
    Number.isFinite(t) && Date.now() - t > AKAHU_TRANSACTION_REFRESH_INTERVAL_MS
  );
}

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

    // Poll briefly for Akahu to finish refreshing before we read transactions.
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

/*
  Express app - every endpoint requires a valid Actual session; the caller's user
  id (res.locals.user_id) comes only from that session, never client input.
*/

const app = express();
export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

// POST /tokens - store the caller's pasted my.akahu.nz personal tokens.
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

// DELETE /tokens - disconnect the caller (drops their stored tokens).
app.delete(
  '/tokens',
  handleError(async (_req, res) => {
    removeUserTokens(res.locals.user_id);
    res.send({ status: 'ok' });
  }),
);

app.post(
  '/status',
  handleError(async (_req, res) => {
    const configured = getUserTokens(res.locals.user_id) != null;

    res.send({
      status: 'ok',
      data: {
        configured,
      },
    });
  }),
);

app.post(
  '/accounts',
  handleError(async (_req, res) => {
    const tokens = getUserTokens(res.locals.user_id);

    if (!tokens) {
      res.send({
        status: 'ok',
        data: {
          error: 'Not connected to Akahu',
        },
      });
      return;
    }

    try {
      const akahu = new AkahuClient({ appToken: tokens.appToken });
      const accounts = await akahu.accounts.list(tokens.userToken);

      res.send({
        status: 'ok',
        data: {
          accounts,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message ? error.message : String(error);

      res.send({
        status: 'error',
        data: {
          error: errorMessage,
        },
      });
    }
  }),
);

app.post(
  '/transactions',
  handleError(async (req, res) => {
    const { accountId, startDate } = req.body || {};

    if (!accountId || !startDate) {
      return res.send({
        status: 'error',
        data: {
          error: 'accountId and startDate are required',
        },
      });
    }

    const tokens = getUserTokens(res.locals.user_id);

    if (!tokens) {
      res.send({
        status: 'ok',
        data: {
          error: 'Not connected to Akahu',
        },
      });
      return;
    }

    try {
      const akahu = new AkahuClient({ appToken: tokens.appToken });

      const account = await getRefreshedAccount(
        akahu,
        tokens.userToken,
        accountId,
      );
      if (!account) {
        return res.send({
          status: 'error',
          data: {
            error: 'Account not found',
          },
        });
      }

      if (!account.balance) {
        return res.send({
          status: 'error',
          data: {
            error: 'Account balance unavailable',
          },
        });
      }

      const now = new Date();
      const endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1,
      ).toISOString();

      // Fetch all transactions using pagination
      const transactions: Transaction[] = [];
      let cursor = undefined;
      do {
        const { items, cursor: nextCursor } =
          await akahu.accounts.listTransactions(tokens.userToken, accountId, {
            start: new Date(startDate).toISOString(),
            end: endDate,
            cursor,
          });

        transactions.push(...items);
        cursor = nextCursor && nextCursor.next ? nextCursor.next : undefined;
      } while (cursor);

      const pendingTransactions = await akahu.accounts.listPendingTransactions(
        tokens.userToken,
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

      // Process booked transactions
      for (const trans of transactions) {
        if (new Date(trans.date) >= startDateObj) {
          const processedTrans = processTransaction(trans, account);
          booked.push(processedTrans);
          all.push(processedTrans);
        }
      }

      // Process pending transactions
      for (const trans of pendingTransactions) {
        if (new Date(trans.date) >= startDateObj) {
          const processedTrans = processPendingTransaction(trans, account);
          pending.push(processedTrans);
          all.push(processedTrans);
        }
      }

      const sortFunction = (a: AkahuTransaction, b: AkahuTransaction) =>
        b.sortOrder - a.sortOrder;
      const bookedSorted = booked.sort(sortFunction);
      const pendingSorted = pending.sort(sortFunction);
      const allSorted = all.sort(sortFunction);

      res.send({
        status: 'ok',
        data: {
          balances,
          startingBalance: currentBalance,
          transactions: {
            all: allSorted,
            booked: bookedSorted,
            pending: pendingSorted,
          },
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message ? error.message : String(error);

      res.send({
        status: 'error',
        data: {
          error: 'Failed to fetch transactions: ' + errorMessage,
        },
      });
    }
  }),
);

// Transaction-processing helpers - kept verbatim from upstream's app-akahu.ts.

function isEnriched(
  trans:
    | Transaction
    | EnrichedTransaction
    | PendingTransaction
    | EnrichedPendingTransaction,
): trans is EnrichedTransaction {
  return 'merchant' in trans || 'meta' in trans || 'category' in trans;
}

function getDate(date: Date): string {
  return formatISO(date).split('T')[0];
}

function convertToCents(amount: number): number {
  return Math.round(amount * 100);
}

function getPayeeName(
  trans:
    | Transaction
    | EnrichedTransaction
    | PendingTransaction
    | EnrichedPendingTransaction,
): string {
  if (isEnriched(trans)) {
    if (trans.merchant?.name) {
      return trans.merchant.name;
    }

    if (trans.meta?.other_account) {
      return trans.meta.other_account;
    }
  }

  return '';
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
  if (isEnriched(trans)) {
    category = trans.category?.name;
  }

  return {
    ...processPendingTransaction(trans, account),
    category,
    booked: true,
    transactionId: trans._id,
  };
}
