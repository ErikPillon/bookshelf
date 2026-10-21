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
