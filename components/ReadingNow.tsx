import type { ActiveBook } from '@/lib/stats';

function Cover({ url, title }: { url: string | null; title: string }) {
  if (!url) {
    return (
      <div
        className="h-[72px] w-12 shrink-0 rounded-sm bg-wash"
        aria-hidden
      />
    );
  }
  return (
    // Plain img: the site exports statically, so there is no image optimizer to
    // route through. Dimensions are fixed so nothing shifts as covers load.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`Cover of ${title}`}
      width={48}
      height={72}
      loading="lazy"
      className="h-[72px] w-12 shrink-0 rounded-sm object-cover"
    />
  );
}

function Row({ entry }: { entry: ActiveBook }) {
  const { book, percent, daysSinceActivity, parked } = entry;

  return (
    <li className="flex items-start gap-3.5 py-3.5">
      <Cover url={book.coverUrl} title={book.title} />

      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-medium text-ink" title={book.title}>
          {book.title}
        </p>
        <p className="m-0 mt-0.5 truncate text-xs text-ink-secondary">{book.author}</p>

        {percent !== null && book.progress ? (
          <>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-wash">
              <div
                className="h-full rounded-full bg-series-1"
                style={{ width: `${Math.max(percent, 1.5)}%` }}
              />
            </div>
            <p className="tnum m-0 mt-1.5 text-xs text-ink-muted">
              Page {book.progress.page} of {book.progress.of} · {Math.round(percent)}%
            </p>
          </>
        ) : (
          <p className="m-0 mt-2 text-xs text-ink-muted">
            No page progress recorded
            {daysSinceActivity !== null && ` · untouched for ${daysSinceActivity} days`}
          </p>
        )}
      </div>

      {parked && (
        <span className="shrink-0 rounded-full bg-wash px-2 py-0.5 text-[11px] text-ink-secondary">
          Parked
        </span>
      )}
    </li>
  );
}

export function ReadingNow({ active }: { active: ActiveBook[] }) {
  const live = active.filter((a) => !a.parked);
  const parked = active.filter((a) => a.parked);

  if (active.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        Nothing on the go. Anything you start on Goodreads shows up here.
      </p>
    );
  }

  return (
    <>
      {live.length > 0 ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {live.map((entry) => (
            <Row key={entry.book.reviewId} entry={entry} />
          ))}
        </ul>
      ) : (
        <p className="py-4 text-sm text-ink-muted">
          No recent activity on any open book.
        </p>
      )}

      {parked.length > 0 && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm text-ink-secondary select-none">
            {parked.length} parked for over two months
          </summary>
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {parked.map((entry) => (
              <Row key={entry.book.reviewId} entry={entry} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
