/*
CI-only helper for the cross-user budget-isolation smoke in ci.yml.

Seeds two enabled BASIC users (ci-alice, ci-bob) and one never-expiring session
token each, straight into account.sqlite. That lets the smoke assert one user
cannot reach another's budget file through app-sync.ts - the file the overlay
never patches, so the zero-fuzz drift detector is blind to a regression in it.

This tests AUTHORISATION (the file.owner === userId gate), not AUTHENTICATION:
the OIDC -> HMAC identity path is already covered by app/test/trackie-identity
.test.ts and assert-overlay.sh, so there is no need to stand up a mock IdP here.

It couples to the users/sessions schema on purpose - on schema drift this fails
loudly (a broken seed), rather than letting the isolation check pass silently.

Usage: node ci-seed-users.cjs <path-to-account.sqlite>
Run from /app so `require('better-sqlite3')` resolves the server's own driver.
*/
const Database = require('better-sqlite3');

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('usage: node ci-seed-users.cjs <path-to-account.sqlite>');
  process.exit(2);
}

const NEVER = -1; // TOKEN_EXPIRATION_NEVER - session never expires mid-run.
const users = [
  ['ci-alice', 'ci-alice-token'],
  ['ci-bob', 'ci-bob-token'],
];

const db = new Database(dbPath);
db.pragma('busy_timeout = 5000'); // the server holds its own connection.

const insUser = db.prepare(
  `INSERT OR REPLACE INTO users (id, user_name, display_name, enabled, owner, role)
   VALUES (?, ?, '', 1, 0, 'BASIC')`,
);
const insSession = db.prepare(
  `INSERT OR REPLACE INTO sessions (token, user_id, expires_at, auth_method)
   VALUES (?, ?, ?, 'openid')`,
);

db.transaction(() => {
  for (const [id, token] of users) {
    insUser.run(id, id);
    insSession.run(token, id, NEVER);
  }
})();

const { n } = db
  .prepare('SELECT COUNT(*) AS n FROM sessions WHERE token IN (?, ?)')
  .get('ci-alice-token', 'ci-bob-token');
if (n !== 2) {
  console.error(`seed failed: expected 2 sessions, found ${n}`);
  process.exit(3);
}
console.log('seeded ci-alice + ci-bob sessions');
