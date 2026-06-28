import { useEffect, useEffectEvent, useRef } from 'react';

import { useSyncAndDownloadMutation } from '#accounts';
import { sync } from '#app/appSlice';
import { useAccounts } from '#hooks/useAccounts';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useDispatch, useStore } from '#redux';

/** Auto-sync linked bank accounts on budget open, throttled to once per 20h. */

const LOG = '[trackie-autosync]';
const AUTO_SYNC_INTERVAL_MS = 20 * 60 * 60 * 1000;

export function useAkahuAutoSync() {
  const dispatch = useDispatch();
  const store = useStore();
  const { data: accounts = [], isFetched } = useAccounts();
  const [, setLastAutoSync] = useSyncedPref('akahu-auto-sync-at');
  const { mutateAsync: syncAndDownload } = useSyncAndDownloadMutation();

  const hasRun = useRef(false);

  const maybeAutoSync = useEffectEvent(async () => {
    const linked = accounts.filter(
      ({ bank, closed, tombstone }) => !!bank && !closed && !tombstone,
    );
    console.info(`${LOG} run: ${accounts.length} accounts, ${linked.length} bank-linked`);
    if (linked.length === 0) {
      return;
    }

    try {
      const syncState = await dispatch(sync()).unwrap();
      if (syncState.error) {
        console.warn(`${LOG} budget sync error, skipping`, syncState.error);
        return;
      }
    } catch (err) {
      console.warn(`${LOG} budget sync threw, skipping`, err);
      return;
    }

    const lastAutoSync = Number(store.getState().prefs.synced['akahu-auto-sync-at'] ?? 0);
    const now = Date.now();
    if (now - lastAutoSync < AUTO_SYNC_INTERVAL_MS) {
      console.info(`${LOG} within 20h window, skipping`);
      return;
    }

    console.info(`${LOG} syncing all bank-linked accounts`);
    try {
      const result = await syncAndDownload({});
      if (result && typeof result === 'object' && 'error' in result) {
        console.warn(`${LOG} sync error, not stamping`, result.error);
        return;
      }
      // Stamp only on success so a failed sync can retry on the next open.
      setLastAutoSync(String(now));
      console.info(`${LOG} done`, result);
    } catch (err) {
      console.warn(`${LOG} sync threw, not stamping`, err);
    }
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
