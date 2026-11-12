import type { Book } from '../../lib/types';

export type CsvBook = Partial<Book> & { bookId: string };

/**
 * Combines the live RSS record for a book with its row in the library export.
 *
 * The governing rule, learned the hard way: **the CSV export is a frozen
 * snapshot and must never override a field that changes over time.** It was
 * taken on one day and committed; RSS is refetched daily. Letting the export
 * win on `shelf` meant that every book moved between shelves after the export
 * was silently reverted on the next sync — a book finished in October stayed
 * filed as currently-reading, and since every statistic filters on
 * `shelf === 'read'`, it vanished from the site entirely.
 *
 * So the export may only do two things:
 *   1. Fill a gap RSS left null (an older read date, a missing page count).
 *   2. Supply the two fields RSS has no equivalent for — `publishedYear`
 *      (RSS reports the edition year, the export the original) and `readCount`
 *      (absent from RSS entirely).
 *
 * Everything else comes from RSS, which is live by definition.
 */
export function mergeBook(rss: Book, csv: CsvBook | undefined): Book {
  if (!csv) return rss;

  return {
    // Live fields — shelf, tags, cover, rating, avgRating — ride along from RSS
    // and are deliberately not overridden below.
    ...rss,

    // Gap-fills: RSS first, export only where RSS has nothing.
    isbn: rss.isbn ?? csv.isbn ?? null,
    pages: rss.pages ?? csv.pages ?? null,
    myRating: rss.myRating ?? csv.myRating ?? null,
    dateRead: rss.dateRead ?? csv.dateRead ?? null,
    dateAdded: rss.dateAdded ?? csv.dateAdded ?? null,
    review: rss.review ?? csv.review ?? null,

    // Re-reads: RSS reports the latest read, the export an earlier one.
    previousReadDate:
      rss.dateRead && csv.dateRead && rss.dateRead !== csv.dateRead ? csv.dateRead : null,

    // The only two fields the export is authoritative for. Neither changes in a
    // way that can mislead: a work's publication year is fixed, and a stale
    // read count can undercount but never misfile a book.
    publishedYear: csv.publishedYear ?? rss.publishedYear,
    readCount: csv.readCount ?? rss.readCount,
  };
}

/**
 * Builds a book from an export row that RSS did not return.
 *
 * RSS returns the whole library, so a row it omits is a book that has since
 * been deleted from Goodreads. It stays in the archive — nothing is ever
 * dropped — but `removedAt` keeps it out of the live counts, otherwise the
 * frozen export keeps resurrecting books the user deleted. A wholesale RSS
 * failure would mark everything removed, which the caller's sanity gate
 * catches before anything is written.
 */
export function fromCsvOnly(csv: CsvBook, removedAt: string): Book {
  return {
    reviewId: `csv-${csv.bookId}`,
    bookId: csv.bookId,
    title: csv.title ?? 'Untitled',
    author: csv.author ?? 'Unknown',
    isbn: csv.isbn ?? null,
    pages: csv.pages ?? null,
    publishedYear: csv.publishedYear ?? null,
    myRating: csv.myRating ?? null,
    avgRating: null,
    dateRead: csv.dateRead ?? null,
    previousReadDate: null,
    dateAdded: csv.dateAdded ?? null,
    dateFirstAdded: csv.dateAdded ?? null,
    tags: csv.tags ?? [],
    review: csv.review ?? null,
    coverUrl: null,
    shelf: csv.shelf ?? 'read',
    readCount: csv.readCount ?? 1,
    progress: null,
    removedAt,
  };
}

/**
 * Merges an export row over whatever we already hold, for the case where the
 * RSS feed is gone and the export is the only live source left.
 *
 * This inverts the usual precedence: here the export is the fresh thing and
 * the stored book is the stale one, so the export owns every field it carries.
 * The stored book is kept only for what the export cannot express — the cover
 * image and the Goodreads community rating, which exist nowhere in the CSV.
 */
export function mergeCsvOverStored(csv: CsvBook, stored: Book | undefined): Book {
  const base = stored ?? fromCsvOnly(csv, '');

  return {
    ...base,

    // The export is live now and owns everything it reports.
    title: csv.title ?? base.title,
    author: csv.author ?? base.author,
    shelf: csv.shelf ?? base.shelf,
    tags: csv.tags ?? base.tags,
    myRating: csv.myRating ?? null,
    dateRead: csv.dateRead ?? null,
    dateAdded: csv.dateAdded ?? base.dateAdded,
    readCount: csv.readCount ?? 1,
    review: csv.review ?? null,
    isbn: csv.isbn ?? base.isbn,
    pages: csv.pages ?? base.pages,
    publishedYear: csv.publishedYear ?? base.publishedYear,

    // Present in the export means present in the library.
    removedAt: null,

    // Enrichment the export has no column for — keep whatever RSS left behind.
    coverUrl: base.coverUrl,
    avgRating: base.avgRating,
    dateFirstAdded: base.dateFirstAdded,
    previousReadDate: base.previousReadDate,
    progress: base.progress,
  };
}

/** Latest read date across a set of books, or null when none has one. */
function latestRead(dates: (string | null | undefined)[]): string | null {
  let latest: string | null = null;
  for (const date of dates) {
    if (date && (latest === null || date > latest)) latest = date;
  }
  return latest;
}

/**
 * Whether a library export is at least as fresh as what is already stored.
 *
 * A changed export is not necessarily a newer one. The export committed with
 * this project was taken in October; by November the stored data — fetched
 * daily while the feed still worked — was six weeks ahead of it. Ingesting on
 * "the file differs" alone walked the library backwards: books finished after
 * the export date lost their read dates and the challenge count dropped.
 *
 * Comparing the latest read date in each is the honest test. An export that
 * knows about a more recent read than we do is genuinely newer.
 */
export function exportIsFresh(csvRows: Iterable<CsvBook>, stored: Book[]): boolean {
  const storedLatest = latestRead(stored.filter((b) => !b.removedAt).map((b) => b.dateRead));
  if (storedLatest === null) return true;

  const csvLatest = latestRead([...csvRows].map((row) => row.dateRead));
  if (csvLatest === null) return false;

  return csvLatest >= storedLatest;
}
