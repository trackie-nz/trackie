// @ts-strict-ignore
import { getAccountDb } from '#account-db';

/*
  TRACKIE active-user metrics. Every authenticated request (sync, account,
  akahu, admin) funnels through the shared validateSessionMiddleware, which is
  the single injection point that calls recordActivity(user_id) after resolving
  the session (patches/activity-tracking.patch). We record at most one row per
  user per UTC day in trackie_activity so we can identify dormant accounts.
*/

/*
  In-process throttle: the first authenticated hit from a user on a given UTC day
  writes to the DB; every later hit that day is a cheap Set lookup. The set is
  cleared when the UTC day rolls over, so it stays bounded to the day's active
  users instead of growing without limit over the server's uptime.
*/
let throttleDay = '';
const seenToday = new Set<string>();

/**
 * Record that `userId` was active today, at most once per user per UTC day.
 *
 * Fire-and-forget and defensive: any failure (DB busy, migration not yet run) is
 * swallowed so activity tracking can never break the request it rides on. The
 * write is `INSERT OR IGNORE`, so a throttle lost to a restart only costs a
 * redundant no-op insert, never a duplicate row. The user is marked seen only
 * after a successful write, so a failed insert is retried on the next request.
 */
export function recordActivity(userId: string): void {
  if (!userId) {
    return;
  }
  try {
    const today = new Date().toISOString().slice(0, 10); // UTC 'YYYY-MM-DD'
    if (today !== throttleDay) {
      throttleDay = today;
      seenToday.clear();
    }
    if (seenToday.has(userId)) {
      return;
    }
    getAccountDb().mutate(
      'INSERT OR IGNORE INTO trackie_activity (user_id, day) VALUES (?, ?)',
      [userId, today],
    );
    seenToday.add(userId);
  } catch {
    /* Never surface an activity-tracking error into the request path. */
  }
}
