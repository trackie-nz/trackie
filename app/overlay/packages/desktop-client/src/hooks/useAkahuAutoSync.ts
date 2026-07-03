import { useEffect, useEffectEvent, useRef } from 'react';

import { useSyncAndDownloadMutation } from '#accounts';
import { sync } from '#app/appSlice';
import { useAccounts } from '#hooks/useAccounts';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useDispatch, useStore } from '#redux';

/**
 * Auto-sync linked bank accounts once per calendar day, on budget open and on
 * resume. A PWA / long-lived tab does not reload when refocused, so we also
 * listen for visibilitychange - the load effect fires once per app lifetime,
 * visibilitychange fires on every resume.
 */

/** Local calendar day as YYYY-MM-DD, so sync runs again after midnight. */
function localDayKey(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useAkahuAutoSync() {
  const dispatch = useDispatch();
  const store = useStore();
  const { data: accounts = [], isFetched } = useAccounts();
  const [, setLastAutoSync] = useSyncedPref('akahu-auto-sync-at');
  const { mutateAsync: syncAndDownload } = useSyncAndDownloadMutation();

  const isSyncing = useRef(false);

  const syncedToday = () => {
    const last = Number(store.getState().prefs.synced['akahu-auto-sync-at'] ?? 0);
    return !!last && localDayKey(last) === localDayKey(Date.now());
  };

  const maybeAutoSync = useEffectEvent(async () => {
    // In-flight lock: focus + visibilitychange routinely fire together, and both
    // pass the day-gate before the first run stamps it. Serialise them.
    if (isSyncing.current) {
      return;
    }

    const hasLinked = accounts.some(
      ({ bank, closed, tombstone }) => !!bank && !closed && !tombstone,
    );
    // Cheap local pre-check so a refocus does not trigger a budget sync when we
    // already synced today on this device.
    if (!hasLinked || syncedToday()) {
      return;
    }

    isSyncing.current = true;
    try {
      // Budget sync first, so the synced day-stamp reflects other devices, then
      // re-check before pulling bank transactions.
      const syncState = await dispatch(sync()).unwrap();
      if (syncState.error || syncedToday()) {
        return;
      }

      const result = await syncAndDownload({}).catch(() => ({ error: true }));
      if (result && typeof result === 'object' && 'error' in result) {
        return;
      }
      // Stamp only on success so a failed sync can retry on the next open/resume.
      setLastAutoSync(String(Date.now()));
    } catch {
      // Ignore; retry on next open/resume.
    } finally {
      isSyncing.current = false;
    }
  });

  useEffect(() => {
    // Gate on isFetched, not isLoading: useAccounts has placeholderData: [], so
    // isLoading is false before the real list loads.
    if (!isFetched) {
      return;
    }

    void maybeAutoSync();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void maybeAutoSync();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isFetched]);
}
