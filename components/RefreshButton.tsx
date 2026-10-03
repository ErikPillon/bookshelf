'use client';

import { useState } from 'react';
import { useSearchParam } from './useSearchParam';

type State = 'idle' | 'starting' | 'started' | 'error';

/**
 * Kicks off a sync without waiting for the daily cron.
 *
 * Only appears when the page URL carries ?key=… — this is a single-user site,
 * so the key lives in a bookmark rather than behind a sign-in. The key is only
 * ever sent to this site's own refresh endpoint, which compares it server side.
 */
export function RefreshButton() {
  const key = useSearchParam('key');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  if (!key) return null;

  async function refresh() {
    setState('starting');
    try {
      const response = await fetch(`/api/refresh?key=${encodeURIComponent(key!)}`, {
        method: 'POST',
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setState('error');
        setMessage(body.error ?? 'Something went wrong.');
        return;
      }
      setState('started');
      setMessage('Syncing now — the page updates in a minute or two.');
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
      <span aria-live="polite" className={state === 'error' ? 'text-[var(--critical)]' : ''}>
        {message}
      </span>
    </p>
  );
}
