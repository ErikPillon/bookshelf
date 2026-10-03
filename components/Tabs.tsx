'use client';

import { useState, type ReactNode } from 'react';
import { useSearchParam } from './useSearchParam';

export interface TabPanel {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * One job per view. Every panel is server-rendered and simply hidden, so
 * switching costs nothing and the whole page stays readable without JS.
 * The active tab lives in the URL so views are shareable and the back button
 * does what it should.
 */
export function Tabs({ panels }: { panels: TabPanel[] }) {
  const fromUrl = useSearchParam('view');
  const [chosen, setChosen] = useState<string | null>(null);

  const active =
    chosen ??
    (fromUrl && panels.some((p) => p.id === fromUrl) ? fromUrl : (panels[0]?.id ?? ''));

  function select(id: string) {
    setChosen(id);
    const url = new URL(window.location.href);
    url.searchParams.set('view', id);
    window.history.replaceState(null, '', url);
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Reading views"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {panels.map((panel) => {
          const selected = panel.id === active;
          return (
            <button
              key={panel.id}
              type="button"
              role="tab"
              id={`tab-${panel.id}`}
              aria-selected={selected}
              aria-controls={`panel-${panel.id}`}
              onClick={() => select(panel.id)}
              className={`min-h-11 shrink-0 cursor-pointer rounded-lg px-3.5 text-sm whitespace-nowrap transition-colors ${
                selected
                  ? 'bg-surface font-medium text-ink shadow-[inset_0_0_0_1px_var(--border)]'
                  : 'text-ink-secondary hover:bg-wash'
              }`}
            >
              {panel.label}
            </button>
          );
        })}
      </div>

      {panels.map((panel) => (
        <div
          key={panel.id}
          role="tabpanel"
          id={`panel-${panel.id}`}
          aria-labelledby={`tab-${panel.id}`}
          hidden={panel.id !== active}
          className="mt-4 flex flex-col gap-4"
        >
          {panel.content}
        </div>
      ))}
    </>
  );
}
