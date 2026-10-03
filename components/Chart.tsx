'use client';

import { useState } from 'react';
import { nf, plural } from './ui';

export type Metric = 'books' | 'pages';

/** A single book inside a column, for the hover list. */
export interface ChartItem {
  title: string;
  author: string;
  pages: number | null;
}

export interface BarDatum {
  label: string;
  /** Short form for narrow screens, e.g. "J" for January. */
  shortLabel?: string;
  books: number;
  pages: number;
  /** Books here with no page count, so a page total can be qualified. */
  booksMissingPages: number;
  items: ChartItem[];
  /** Optional annotation shown beside the value, e.g. an average rating. */
  note?: string;
}

const H = 180;
/** Long columns would otherwise produce a panel taller than the chart. */
const MAX_LISTED = 5;

const compact = new Intl.NumberFormat('en-US', { notation: 'compact' });

const valueOf = (d: BarDatum, metric: Metric) => (metric === 'books' ? d.books : d.pages);

const describe = (d: BarDatum, metric: Metric) =>
  metric === 'books' ? plural(d.books, 'book') : `${nf.format(d.pages)} pages`;

/** Nice round axis maximum, so ticks are readable numbers. */
function axisMax(values: number[]): number {
  const peak = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const step = peak / magnitude <= 2 ? magnitude / 2 : magnitude;
  return Math.max(step, Math.ceil(peak / step) * step);
}

export function MetricToggle({
  metric,
  onChange,
}: {
  metric: Metric;
  onChange: (metric: Metric) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Show books or pages"
      className="inline-flex rounded-lg border border-line p-0.5"
    >
      {(['books', 'pages'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={metric === option}
          onClick={() => onChange(option)}
          className={`min-h-9 cursor-pointer rounded-md px-3 text-xs capitalize transition-colors ${
            metric === option
              ? 'bg-wash font-medium text-ink'
              : 'text-ink-secondary hover:text-ink'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** The list of books behind a column. Shared by both chart shapes. */
function BookList({ datum, metric }: { datum: BarDatum; metric: Metric }) {
  const shown = datum.items.slice(0, MAX_LISTED);
  const rest = datum.items.length - shown.length;

  return (
    <>
      <p className="m-0 border-b border-line pb-1.5 text-xs font-semibold text-ink">
        {datum.label} · {describe(datum, metric)}
        {metric === 'pages' && datum.booksMissingPages > 0 && (
          <span className="font-normal text-ink-muted">
            {' '}
            ({plural(datum.booksMissingPages, 'book')} with no count)
          </span>
        )}
      </p>

      {shown.length === 0 ? (
        <p className="m-0 pt-1.5 text-xs text-ink-muted">Nothing here.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 pt-1.5">
          {shown.map((item) => (
            <li key={`${item.title}-${item.author}`} className="text-xs leading-snug">
              <span className="text-ink">{item.title}</span>
              <span className="text-ink-muted">
                {' · '}
                {item.author}
                {item.pages !== null && ` · ${nf.format(item.pages)}pp`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {rest > 0 && <p className="m-0 pt-1.5 text-xs text-ink-muted">and {rest} more</p>}
    </>
  );
}

interface ChartProps {
  data: BarDatum[];
  /** Said in words, not left to the axis ticks. */
  range: string;
  emptyMessage?: string;
}

/**
 * Column chart. One idea per chart, one series, no second axis.
 *
 * Laid out with CSS rather than SVG: a viewBox scaled to the container width
 * stretches the 4px data-end radius and the 2px gap along with it, so the marks
 * stop matching their spec at anything but one exact width.
 */
export function Chart({ data, range, emptyMessage = 'Nothing to show yet.' }: ChartProps) {
  const [metric, setMetric] = useState<Metric>('books');
  const [hovered, setHovered] = useState<number | null>(null);
  // Click pins a column open — hover alone is invisible on touch.
  const [pinned, setPinned] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">{emptyMessage}</p>;
  }

  const values = data.map((d) => valueOf(d, metric));
  const max = axisMax(values);
  const ticks = [0, max / 2, max];
  const peak = Math.max(...values);
  const activeIndex = pinned ?? hovered;
  const active = activeIndex === null ? null : data[activeIndex];

  return (
    <figure className="m-0">
      <div className="mb-4 flex justify-end">
        <MetricToggle
          metric={metric}
          onChange={(next) => {
            setMetric(next);
            setPinned(null);
          }}
        />
      </div>

      {peak === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">{emptyMessage}</p>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="relative w-8 shrink-0" style={{ height: H }} aria-hidden>
              {ticks.map((t) => (
                <span
                  key={t}
                  className="tnum absolute right-0 -translate-y-1/2 text-[11px] text-ink-muted"
                  style={{ top: H - (t / max) * H }}
                >
                  {metric === 'pages' ? compact.format(t) : t}
                </span>
              ))}
            </div>

            <div className="min-w-0 flex-1">
              <div className="relative" style={{ height: H }}>
                {ticks.map((t) => (
                  <div
                    key={t}
                    className="absolute inset-x-0 border-t"
                    style={{
                      top: H - (t / max) * H,
                      borderColor: t === 0 ? 'var(--baseline)' : 'var(--gridline)',
                    }}
                  />
                ))}

                <div className="absolute inset-0 flex items-end gap-0.5">
                  {data.map((d, i) => {
                    const value = valueOf(d, metric);

                    return (
                      <button
                        key={d.label}
                        type="button"
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                        onFocus={() => setHovered(i)}
                        onBlur={() => setHovered((h) => (h === i ? null : h))}
                        onClick={() => setPinned(pinned === i ? null : i)}
                        aria-expanded={activeIndex === i}
                        aria-label={`${d.label}: ${describe(d, metric)}`}
                        className="group relative flex h-full flex-1 cursor-pointer items-end justify-center"
                      >
                        {value > 0 && (
                          <span
                            className={`w-full max-w-11 rounded-t bg-series-1 transition-opacity ${
                              activeIndex === i ? 'opacity-80' : 'group-hover:opacity-80'
                            }`}
                            style={{ height: `${(value / max) * 100}%` }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* One panel for the whole plot, centred inside it. Anchoring a
                    panel to each column pushed it off the top of the card on a
                    tall bar, and off the side of the screen on a phone. */}
                {active && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
                    <div className="pointer-events-auto max-h-44 w-full max-w-60 overflow-y-auto rounded-lg border border-line bg-surface p-2.5 shadow-lg">
                      <BookList datum={active} metric={metric} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-0.5" aria-hidden>
                {data.map((d) => (
                  <span
                    key={d.label}
                    className="min-w-0 flex-1 truncate pt-1.5 text-center text-[11px] text-ink-muted"
                  >
                    <span className="hidden sm:inline">{d.label}</span>
                    <span className="sm:hidden">{d.shortLabel ?? d.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <figcaption className="mt-3 text-xs text-ink-muted">
            {metric} per {range} · peak {metric === 'pages' ? nf.format(peak) : peak} ·
            hover or tap a column for the books
          </figcaption>
        </>
      )}
    </figure>
  );
}

/**
 * Horizontal bars for long labels (authors, shelves, decades), where a vertical
 * axis would force the text to rotate.
 */
export function RankedBars({
  data,
  emptyMessage = 'Nothing tagged yet.',
}: {
  data: BarDatum[];
  emptyMessage?: string;
}) {
  const [metric, setMetric] = useState<Metric>('books');
  const [pinned, setPinned] = useState<string | null>(null);

  if (data.length === 0) {
    return <p className="py-6 text-sm text-ink-muted">{emptyMessage}</p>;
  }

  const max = Math.max(1, ...data.map((d) => valueOf(d, metric)));

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <MetricToggle
          metric={metric}
          onChange={(next) => {
            setMetric(next);
            setPinned(null);
          }}
        />
      </div>

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {data.map((d) => {
          const value = valueOf(d, metric);
          const isPinned = pinned === d.label;

          return (
            <li key={d.label} className="group relative">
              <button
                type="button"
                onClick={() => setPinned(isPinned ? null : d.label)}
                aria-expanded={isPinned}
                aria-label={`${d.label}: ${describe(d, metric)}`}
                className="block w-full cursor-pointer text-left"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-ink">{d.label}</span>
                  <span className="tnum shrink-0 text-xs text-ink-muted">
                    {describe(d, metric)}
                    {d.note && ` · ${d.note}`}
                  </span>
                </span>
                <span className="mt-1 block h-1.5 w-full rounded-full bg-wash">
                  <span
                    className="block h-1.5 rounded-full bg-series-1"
                    style={{ width: `${Math.max((value / max) * 100, 1)}%` }}
                  />
                </span>
              </button>

              <div
                className={`invisible absolute top-full right-0 z-10 mt-1 w-full max-w-64 rounded-lg border border-line bg-surface p-2.5 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${
                  isPinned ? '!visible !opacity-100' : ''
                }`}
              >
                <BookList datum={d} metric={metric} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
