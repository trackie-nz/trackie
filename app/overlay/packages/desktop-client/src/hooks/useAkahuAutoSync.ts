import { useEffect, useEffectEvent, useRef } from 'react';

import { useSyncAndDownloadMutation } from '#accounts';
import { sync } from '#app/appSlice';
import { useAccounts } from '#hooks/useAccounts';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useDispatch, useStore } from '#redux';

/*
  TRACKIE: auto-sync linked bank accounts when a budget is opened.

  Upstream bank sync is fully manual - the user opens the app and clicks the sync
  link on each account. This fires a sync of all bank-linked accounts on budget
  open, throttled so reopening or reloading does not re-sync each time.

  The throttle is a *synced* pref (`akahu-auto-sync-at`), not localStorage, so
  the 20h gate is global across the user's devices: sync on desktop, open the
  phone an hour later, and the phone sees the fresh timestamp and skips. The pref
  lives in the per-budget database, so the gate is per-user and never shared
  between users (see saveSyncedPrefs -> db.update('preferences')).

  The timestamp is stamped only AFTER a sync actually succeeds, so a failed sync
  (e.g. expired token, transient server error) does not lock auto-sync out for
  20h. The server remains the authoritative throttle on the expensive Akahu
  refresh (getRefreshedAccount caps it to once per 20h per user); this client
  gate only avoids firing a redundant sync round-trip on every app open.
*/

const LOG = '[trackie-autosync]';
const AUTO_SYNC_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20h, matches the server cap.

export function useAkahuAutoSync() {
  const dispatch = useDispatch();
  const store = useStore();
  const { data: accounts = [], isLoading } = useAccounts();
  const [, setLastAutoSync] = useSyncedPref('akahu-auto-sync-at');
  const { mutateAsync: syncAndDownload } = useSyncAndDownloadMutation();

  // Run at most once per budget open (mount), and only once accounts are loaded.
  const hasRun = useRef(false);

  const maybeAutoSync = useEffectEvent(async () => {
    const linked = accounts.filter(
      ({ bank, closed, tombstone }) => !!bank && !closed && !tombstone,
    );
    console.info(
      `${LOG} run: ${accounts.length} accounts, ${linked.length} bank-linked`,
    );
    if (linked.length === 0) {
      console.info(`${LOG} no bank-linked accounts, skipping`);
      return;
    }

    // Pull the latest budget state first so the synced timestamp reflects
    // whatever device synced most recently - this is what makes the gate global.
    try {
      const syncState = await dispatch(sync()).unwrap();
      if (syncState.error) {
        console.warn(`${LOG} initial budget sync returned error, skipping`, syncState.error);
        return;
      }
    } catch (err) {
      console.warn(`${LOG} initial budget sync threw, skipping`, err);
      return;
    }

    const lastAutoSync = Number(
      store.getState().prefs.synced['akahu-auto-sync-at'] ?? 0,
    );
    const now = Date.now();
    const ageHours = ((now - lastAutoSync) / (60 * 60 * 1000)).toFixed(1);
    console.info(
      `${LOG} gate: lastAutoSync=${lastAutoSync} (${ageHours}h ago), interval=20h`,
    );
    if (now - lastAutoSync < AUTO_SYNC_INTERVAL_MS) {
      console.info(`${LOG} within 20h window, skipping`);
      return;
    }

    // Empty payload syncs every bank-linked account, reusing the exact path the
    // manual sync link uses; per-account errors surface as notifications without
    // aborting the others or blocking budget load.
    console.info(`${LOG} triggering sync of all bank-linked accounts`);
    try {
      const result = await syncAndDownload({});
      if (result && typeof result === 'object' && 'error' in result) {
        console.warn(`${LOG} sync returned error, NOT stamping gate`, result.error);
        return;
      }
      // Stamp only after a successful sync so failures can retry on next open.
      setLastAutoSync(String(now));
      console.info(`${LOG} sync complete, stamped gate at ${now}`, result);
    } catch (err) {
      console.warn(`${LOG} syncAndDownload threw, NOT stamping gate`, err);
    }
  });

  useEffect(() => {
    console.info(`${LOG} effect: isLoading=${isLoading}, hasRun=${hasRun.current}`);
    if (hasRun.current || isLoading) {
      return;
    }
    hasRun.current = true;
    void maybeAutoSync();
  }, [isLoading]);
}
