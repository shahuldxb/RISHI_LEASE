/**
 * useScreenAudit — fires SCREEN_ENTER on mount and SCREEN_EXIT (with elapsed ms) on unmount.
 * Designed to be called inside ScreenHeader so every page that already uses ScreenHeader
 * gets automatic visit logging without any per-page changes.
 */
import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';

export function useScreenAudit(screenId: string, screenTitle?: string) {
  const enterTime = useRef<number>(Date.now());

  // Fire-and-forget mutations — errors are silently swallowed so they never
  // block or break the UI.
  const logVisit = trpc.compliance.logScreenVisit.useMutation({
    onError: () => { /* silent */ },
  });

  useEffect(() => {
    if (!screenId) return;
    enterTime.current = Date.now();

    logVisit.mutate({ screenId, screenTitle, action: 'ENTER' });

    return () => {
      const elapsedMs = Date.now() - enterTime.current;
      logVisit.mutate({ screenId, screenTitle, action: 'EXIT', elapsedMs });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenId]);
}
