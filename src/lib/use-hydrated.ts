'use client';

import { useSyncExternalStore } from 'react';

/**
 * True once the component has hydrated in the browser, false during server
 * rendering and the first client render.
 *
 * Components that read localStorage need to know when it is safe to look. The
 * obvious approach — `useState(false)` plus `useEffect(() => setMounted(true))`
 * — sets state synchronously inside an effect, which React 19 flags because it
 * schedules a second render pass immediately after the first.
 *
 * `useSyncExternalStore` is the API built for exactly this: it lets the server
 * and the client return different snapshots without a mismatch, and without a
 * state update. The store never changes, so `subscribe` is a no-op.
 */

const noopSubscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,   // client
    () => false,  // server
  );
}
