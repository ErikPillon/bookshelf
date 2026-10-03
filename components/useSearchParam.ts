'use client';

import { useCallback, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

/**
 * Reads one query parameter.
 *
 * Uses useSyncExternalStore rather than an effect: reading the URL in an effect
 * and calling setState causes a second render on every mount, and React now
 * flags it. The server snapshot is null, which is also what hydration sees, so
 * the markup matches; the real value arrives in the same pass.
 */
export function useSearchParam(name: string): string | null {
  const read = useCallback(
    () => new URLSearchParams(window.location.search).get(name),
    [name],
  );
  return useSyncExternalStore(subscribe, read, () => null);
}
