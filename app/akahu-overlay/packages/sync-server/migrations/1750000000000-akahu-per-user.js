import { getAccountDb } from '../src/account-db';

export const up = async function () {
  await getAccountDb().exec(`
    CREATE TABLE IF NOT EXISTS akahu_connections (
      user_id     TEXT    PRIMARY KEY,
      user_token  TEXT    NOT NULL,
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
