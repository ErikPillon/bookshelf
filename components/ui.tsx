import type { ReactNode } from 'react';

export const nf = new Intl.NumberFormat('en-US');

/** "1 book" / "2 books" — plural agreement, everywhere. */
export const plural = (count: number, singular: string, plural = `${singular}s`) =>
  `${nf.format(count)} ${count === 1 ? singular : plural}`;

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</div>
      <div className="mt-1.5 text-2xl leading-none font-semibold text-ink">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-ink-secondary">{hint}</div>}
    </div>
  );
}

export function Panel({
  title,
  note,
  children,
  action,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="m-0 text-base font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {note && <p className="-mt-2 mb-4 text-sm text-ink-secondary">{note}</p>}
      {children}
    </section>
  );
}

/**
 * Collapsible data table behind every chart — the accessible fallback, and the
 * answer when the question is "what is the value" rather than "what is the shape".
 */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer text-xs text-ink-secondary select-none">
        Show the numbers
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={`border-b border-line pb-2 text-xs font-medium text-ink-muted ${
                    i === 0 ? 'text-left' : 'text-right'
                  }`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])}>
                {row.map((cell, i) => (
                  <td
                    key={i}
                    className={`tnum border-b border-line py-1.5 text-ink-secondary ${
                      i === 0 ? 'text-left' : 'text-right'
                    }`}
                  >
                    {typeof cell === 'number' ? nf.format(cell) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
