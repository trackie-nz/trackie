import { useEffect, useEffectEvent, useRef } from 'react';

import { useSyncAndDownloadMutation } from '#accounts';
import { sync } from '#app/appSlice';
import { useAccounts } from '#hooks/useAccounts';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useDispatch, useStore } from '#redux';

/** Auto-sync linked bank accounts on budget open, throttled to once per calendar day. */

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

  const hasRun = useRef(false);

  const maybeAutoSync = useEffectEvent(async () => {
    const hasLinked = accounts.some(
      ({ bank, closed, tombstone }) => !!bank && !closed && !tombstone,
    );
    if (!hasLinked) {
      return;
    }

    try {
      const syncState = await dispatch(sync()).unwrap();
      if (syncState.error) {
        return;
      }
    } catch {
      return;
    }

    const lastAutoSync = Number(store.getState().prefs.synced['akahu-auto-sync-at'] ?? 0);
    const now = Date.now();
    // Sync once per calendar day, so opening at 9pm and again at 7am both sync.
    if (lastAutoSync && localDayKey(lastAutoSync) === localDayKey(now)) {
      return;
    }

    const result = await syncAndDownload({}).catch(() => ({ error: true }));
    if (result && typeof result === 'object' && 'error' in result) {
      return;
    }
    // Stamp only on success so a failed sync can retry on the next open.
    setLastAutoSync(String(now));
  });

  useEffect(() => {
    // Gate on isFetched, not isLoading: useAccounts has placeholderData: [], so
    // isLoading is false before the real list loads.
    if (hasRun.current || !isFetched) {
      return;
    }
    hasRun.current = true;
    void maybeAutoSync();
  }, [isFetched]);
}
