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

  The throttle is a *synced* pref (`akahu-last-auto-sync`), not localStorage, so
  the 20h gate is global across the user's devices: sync on desktop, open the
  phone an hour later, and the phone sees the fresh timestamp and skips. The pref
  lives in the per-budget database, so the gate is per-user and never shared
  between users (see saveSyncedPrefs -> db.update('preferences')).

  We read the timestamp only *after* the initial budget (CRDT) sync completes, so
  it reflects whatever device synced most recently. The server remains the
  authoritative throttle on the expensive Akahu refresh (getRefreshedAccount caps
  it to once per 20h per user); this client gate only avoids firing a redundant
  sync round-trip on every app open.
*/

const AUTO_SYNC_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20h, matches the server cap.

export function useAkahuAutoSync() {
  const dispatch = useDispatch();
  const store = useStore();
  const { data: accounts = [], isLoading } = useAccounts();
  const [, setLastAutoSync] = useSyncedPref('akahu-last-auto-sync');
  const { mutate: syncAndDownload } = useSyncAndDownloadMutation();

  // Run at most once per budget open (mount), and only once accounts are loaded.
  const hasRun = useRef(false);

  const maybeAutoSync = useEffectEvent(async () => {
    // Nothing to sync if the user has not linked a bank account; skip entirely so
    // non-bank users never pay a sync or write the pref.
    const hasLinkedAccount = accounts.some(
      ({ bank, closed, tombstone }) => !!bank && !closed && !tombstone,
    );
    if (!hasLinkedAccount) {
      return;
    }

    // Pull the latest budget state first so the synced timestamp reflects
    // whatever device synced most recently - this is what makes the gate global.
    // A failed initial sync must not block budget load, so just skip auto-sync.
    try {
      const syncState = await dispatch(sync()).unwrap();
      if (syncState.error) {
        return;
      }
    } catch {
      return;
    }

    const lastAutoSync = Number(
      store.getState().prefs.synced['akahu-last-auto-sync'] ?? 0,
    );
    const now = Date.now();
    if (now - lastAutoSync < AUTO_SYNC_INTERVAL_MS) {
      return;
    }

    // Stamp the time optimistically (before awaiting the sync) so a second device
    // opening moments later sees the fresh timestamp and does not also trigger.
    // The server's own 20h cap is the real guard against a duplicate refresh, so
    // the worst case of a failed sync here is one skipped auto-sync, not bad data
    // - and manual per-account sync still works.
    setLastAutoSync(String(now));

    // Empty payload syncs every bank-linked account, reusing the exact path the
    // manual sync link uses; per-account errors surface as notifications without
    // aborting the others or blocking budget load.
    syncAndDownload({});
  });

  useEffect(() => {
    if (hasRun.current || isLoading) {
      return;
    }
    hasRun.current = true;
    void maybeAutoSync();
  }, [isLoading]);
}
