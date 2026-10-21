'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'bookshelf:refresh-key';

let listeners: (() => void)[] = [];

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
  };
}

/** Private browsing and blocked site data both make this throw. */
function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveRefreshKey(value: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Not storable — the button still works for this visit via the URL.
  }
  for (const listener of listeners) listener();
}

/**
 * The refresh key, remembered per browser.
 *
 * Visiting once with ?key=… is enough; after that the button is simply there.
 * Requiring the query string on every visit made the button look missing.
 */
export function useStoredRefreshKey(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
