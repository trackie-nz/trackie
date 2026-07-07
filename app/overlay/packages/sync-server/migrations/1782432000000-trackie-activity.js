import { getAccountDb } from '../src/account-db';

/*
  TRACKIE active-user metrics. One tiny row per user per NZ day, written by the
  recordActivity helper (src/util/trackie-activity.ts) from the shared session
  middleware.

  The FK declares ON DELETE CASCADE to document intent, but the sync-server opens
  SQLite without `PRAGMA foreign_keys = ON`, so the cascade does NOT fire at
  runtime - a user-delete / reap path clears these rows explicitly, mirroring
  akahu_connections.
*/

export const up = async function () {
  await getAccountDb().exec(`
    CREATE TABLE IF NOT EXISTS trackie_activity (
      user_id TEXT NOT NULL,
      day     TEXT NOT NULL,               -- NZ (Pacific/Auckland) 'YYYY-MM-DD'
      PRIMARY KEY (user_id, day),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
};

export const down = async function () {
  await getAccountDb().exec(`
    DROP TABLE IF EXISTS trackie_activity;
  `);
};
