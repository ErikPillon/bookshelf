'use client';

import { useEffect, useState } from 'react';
import { saveRefreshKey, useStoredRefreshKey } from './refreshKey';
import { useSearchParam } from './useSearchParam';

type State = 'idle' | 'starting' | 'started' | 'error';

/**
 * Kicks off a sync without waiting for the daily cron.
 *
 * Shown only to someone holding the refresh key, since this is a public site
 * and the button triggers a GitHub workflow. Visit once with ?key=… and the
 * key is remembered in this browser, then dropped from the address bar so it
 * does not sit in history or get copied into a shared link.
 */
export function RefreshButton() {
  const urlKey = useSearchParam('key');
  const storedKey = useStoredRefreshKey();
  const key = urlKey ?? storedKey;

  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!urlKey) return;
    saveRefreshKey(urlKey);

    const url = new URL(window.location.href);
    url.searchParams.delete('key');
    window.history.replaceState(null, '', url);
  }, [urlKey]);

  if (!key) return null;

  async function refresh() {
    setState('starting');
    try {
      const response = await fetch(`/api/refresh?key=${encodeURIComponent(key!)}`, {
        method: 'POST',
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (response.ok) {
        setState('started');
        setMessage('Syncing now — this page updates in a minute or two.');
        return;
      }

      setState('error');
      setMessage(
        response.status === 401
          ? 'That refresh key is not right.'
          : (body.error ?? 'Something went wrong.'),
      );
    } catch {
      setState('error');
      setMessage('Could not reach the site. Check your connection and try again.');
    }
  }

  return (
    <p className="m-0 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={refresh}
        disabled={state === 'starting' || state === 'started'}
        className="min-h-11 cursor-pointer rounded-lg border border-line px-3 text-xs text-ink hover:bg-wash disabled:cursor-default disabled:opacity-50"
      >
        {state === 'starting' ? 'Starting…' : 'Refresh from Goodreads'}
      </button>
      <span
        aria-live="polite"
        className={state === 'error' ? 'text-[var(--critical)]' : undefined}
      >
        {message}
      </span>
    </p>
  );
}
