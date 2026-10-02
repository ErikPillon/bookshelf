import { BookTable } from '@/components/BookTable';
import { RefreshButton } from '@/components/RefreshButton';
import { ChallengeHero } from '@/components/ChallengeHero';
import { Chart, RankedBars, type BarDatum } from '@/components/Chart';
import { ReadingNow } from '@/components/ReadingNow';
import { Tabs } from '@/components/Tabs';
import { DataTable, nf, Panel, plural, StatTile } from '@/components/ui';
import { CHALLENGE_GOALS, GOODREADS_PROFILE_URL, SITE } from '@/lib/config';
import { loadLibrary, loadMeta } from '@/lib/data';
import {
  booksPerMonth,
  booksPerYear,
  challengeStats,
  currentMonthStreak,
  currentlyReading,
  extremes,
  formatYear,
  publicationBuckets,
  ratingStats,
  topAuthors,
  topTags,
  totals,
} from '@/lib/stats';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default function Home() {
  const { books } = loadLibrary();
  const meta = loadMeta();

  // "Now" is build time. The site rebuilds daily and the footer states when, so
  // day-counting figures are never more than a build old.
  const now = new Date();
  const year = now.getUTCFullYear();

  if (books.length === 0) {
    return (
      <Shell meta={meta}>
        <Panel title="No reading history yet">
          <p className="m-0 text-sm text-ink-secondary">
            Nothing has been synced from Goodreads yet. Once the first sync runs, this
            page fills in with challenge progress, reading history and every book on
            the shelves.
          </p>
        </Panel>
      </Shell>
    );
  }

  const challenge = challengeStats(books, CHALLENGE_GOALS[year] ?? null, now);
  const months = booksPerMonth(books, year);
  const years = booksPerYear(books);
  const ratings = ratingStats(books);
  const t = totals(books);
  const e = extremes(books);
  const active = currentlyReading(books, now);
  const streak = currentMonthStreak(books, now);
  const pagesThisYear = months.reduce((sum, m) => sum + m.pages, 0);

  const monthData: BarDatum[] = months.map((m, i) => ({
    label: MONTHS[i]!,
    shortLabel: MONTHS[i]![0],
    value: m.books,
    detail: m.pages > 0 ? `${nf.format(m.pages)} pages` : undefined,
  }));

  const yearData: BarDatum[] = years.map((y) => ({
    label: String(y.year),
    shortLabel: `’${String(y.year).slice(2)}`,
    value: y.books,
    detail: `${nf.format(y.pages)} pages`,
  }));

  const ratingData: BarDatum[] = ratings.histogram.map((h) => ({
    label: `${h.rating}★`,
    value: h.count,
  }));

  const spread = publicationBuckets(books);

  const taggedRead = books.filter(
    (b) => b.shelf === 'read' && !b.removedAt && b.tags.length > 0,
  ).length;

  return (
    <Shell meta={meta}>
      <Tabs
        panels={[
          {
            id: 'year',
            label: 'This year',
            content: (
              <>
                <ChallengeHero
                  challenge={challenge}
                  pagesThisYear={pagesThisYear}
                  streakMonths={streak}
                />
                <Panel title={`Books finished each month in ${year}`}>
                  <Chart
                    data={monthData}
                    unit="books"
                    range={`month in ${year}`}
                    emptyMessage={`Nothing finished in ${year} yet.`}
                  />
                  <DataTable
                    caption={`Books and pages finished per month in ${year}`}
                    columns={['Month', 'Books', 'Pages']}
                    rows={months.map((m, i) => [MONTHS[i]!, m.books, m.pages])}
                  />
                </Panel>
              </>
            ),
          },
          {
            id: 'now',
            label: `Reading now (${t.shelves['currently-reading']})`,
            content: (
              <Panel
                title="On the go"
                note="Page progress comes from Goodreads status updates, so it only appears for books you have posted an update on."
              >
                <ReadingNow active={active} />
              </Panel>
            ),
          },
          {
            id: 'history',
            label: 'History',
            content: (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile label="Books read" value={nf.format(t.read)} />
                  <StatTile
                    label="Pages read"
                    value={nf.format(t.pages)}
                    hint={
                      t.booksMissingPages > 0
                        ? `${plural(t.booksMissingPages, 'book has', 'books have')} no page count`
                        : undefined
                    }
                  />
                  <StatTile
                    label="Average length"
                    value={t.averagePages ? `${Math.round(t.averagePages)} pp` : '—'}
                  />
                  <StatTile label="Read more than once" value={plural(t.rereads, 'book')} />
                </div>

                <Panel title="Books finished each year">
                  <Chart data={yearData} unit="books" range="year" />
                  <DataTable
                    caption="Books and pages finished per year"
                    columns={['Year', 'Books', 'Pages']}
                    rows={years.map((y) => [String(y.year), y.books, y.pages])}
                  />
                </Panel>

                <Panel title="Notable">
                  <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    <Notable label="Longest" book={e.longest?.title} detail={e.longest?.pages ? `${nf.format(e.longest.pages)} pages` : undefined} />
                    <Notable label="Shortest" book={e.shortest?.title} detail={e.shortest?.pages ? `${nf.format(e.shortest.pages)} pages` : undefined} />
                    <Notable label="Oldest" book={e.oldest?.title} detail={formatYear(e.oldest?.publishedYear ?? null)} />
                    <Notable label="Newest" book={e.newest?.title} detail={formatYear(e.newest?.publishedYear ?? null)} />
                  </dl>
                </Panel>
              </>
            ),
          },
          {
            id: 'taste',
            label: 'Taste',
            content: (
              <>
                <Panel
                  title="How you rate"
                  note={
                    ratings.delta !== null
                      ? `Across the ${nf.format(ratings.rated)} books you rated, your average is ${ratings.myAverage?.toFixed(2)} against a Goodreads average of ${ratings.communityAverage?.toFixed(2)} for the same books — ${Math.abs(ratings.delta).toFixed(2)} ${ratings.delta >= 0 ? 'more generous' : 'harsher'}.`
                      : undefined
                  }
                >
                  <Chart data={ratingData} unit="books" range="rating" />
                  <DataTable
                    caption="Number of books at each rating"
                    columns={['Rating', 'Books']}
                    rows={ratings.histogram.map((h) => [`${h.rating} stars`, h.count])}
                  />
                </Panel>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title="Most read authors">
                    <RankedBars
                      data={topAuthors(books, 8).map((a) => ({
                        label: a.label,
                        value: a.count,
                        detail: `${plural(a.count, 'book')}${a.averageRating ? ` · ${a.averageRating.toFixed(1)}★` : ''}`,
                      }))}
                      unit="books"
                    />
                  </Panel>

                  <Panel
                    title="Shelves"
                    note={`Only ${taggedRead} of ${nf.format(t.read)} read books are tagged, so this is a partial picture.`}
                  >
                    <RankedBars
                      data={topTags(books, 8).map((tag) => ({
                        label: tag.label,
                        value: tag.count,
                        detail: plural(tag.count, 'book'),
                      }))}
                      unit="books"
                    />
                  </Panel>
                </div>

                <Panel
                  title="When the books were written"
                  note={
                    spread.excluded > 0
                      ? `${plural(spread.excluded, 'book')} published before 1900 left out — they stretch the scale so far that the modern decades vanish.`
                      : undefined
                  }
                >
                  <RankedBars
                    data={spread.buckets.map((b) => ({
                      label: b.label,
                      value: b.count,
                      detail: plural(b.count, 'book'),
                    }))}
                    unit="books"
                  />
                </Panel>
              </>
            ),
          },
          {
            id: 'all',
            label: 'All books',
            content: (
              <Panel title="Every book on the shelves">
                <BookTable books={books} />
              </Panel>
            ),
          },
        ]}
      />
    </Shell>
  );
}

function Notable({
  label,
  book,
  detail,
}: {
  label: string;
  book?: string;
  detail?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</dt>
      <dd className="m-0 mt-1 text-sm text-ink">
        {book ?? '—'}
        {detail && <span className="text-ink-muted"> · {detail}</span>}
      </dd>
    </div>
  );
}

function Shell({
  meta,
  children,
}: {
  meta: ReturnType<typeof loadMeta>;
  children: React.ReactNode;
}) {
  const syncedAt = meta?.syncedAt
    ? new Date(meta.syncedAt).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <p className="m-0 text-lg font-semibold text-ink">{SITE.owner}&rsquo;s {SITE.title.toLowerCase()}</p>
        <p className="m-0 mt-1 text-sm text-ink-secondary">{SITE.description}</p>
      </header>

      {children}

      <footer className="mt-10 border-t border-line pt-5 text-xs text-ink-muted">
        {/* Provenance: where the numbers came from and how fresh they are. */}
        <p className="m-0">
          {syncedAt ? `Synced from Goodreads on ${syncedAt} UTC` : 'Not yet synced'} ·{' '}
          <a
            href={GOODREADS_PROFILE_URL}
            className="underline hover:text-ink"
            rel="noreferrer"
          >
            Goodreads profile
          </a>
        </p>
        <RefreshButton />
        {meta?.warnings && meta.warnings.length > 0 && (
          <ul className="m-0 mt-2 list-none p-0">
            {meta.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}
