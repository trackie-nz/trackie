import { getAccountDb } from '../src/account-db';

/*
  Per-user Akahu connection store. Each NZ user pastes their own my.akahu.nz
  personal App ID Token + User Access Token; we keep one row per user, both
  tokens encrypted at rest (AES-256-GCM - see app-akahu/app-akahu.ts). This
  replaces upstream's single global secretsService tokens, so every user has
  their own private, read-only bank connection.

  The FK declares ON DELETE CASCADE to document intent, but the sync-server opens
  SQLite without `PRAGMA foreign_keys = ON`, so the cascade does NOT fire at
  runtime. Deletion is therefore handled explicitly in user-service deleteUser
  (patches/akahu-user-delete.patch) - keep the two in step.
*/

export const up = async function () {
  await getAccountDb().exec(`
    CREATE TABLE IF NOT EXISTS akahu_connections (
      user_id      TEXT    PRIMARY KEY,
      app_token    TEXT    NOT NULL,   -- encrypted
      user_token   TEXT    NOT NULL,   -- encrypted
      connected_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
};

export const down = async function () {
  await getAccountDb().exec(`
    DROP TABLE IF EXISTS akahu_connections;
  `);
};
