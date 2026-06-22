import { getAccountDb } from '../src/account-db';

export const up = async function () {
  await getAccountDb().exec(`
    CREATE TABLE IF NOT EXISTS akahu_oauth_states (
      state       TEXT    PRIMARY KEY,
      user_id     TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );
  `);
};

export const down = async function () {
  await getAccountDb().exec(`
    DROP TABLE IF EXISTS akahu_oauth_states;
  `);
};
