/**
 * Fetches Goodreads data, normalizes it, and writes data/*.json.
 *
 * Runs in CI (and locally). Never runs at request time — the site reads the
 * committed JSON, so the page cannot break when Goodreads is slow or blocking.
 *
 *   npm run sync            fetch + write
 *   npm run sync -- --dry   fetch + report, write nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Book, Library, Meta, Progress, Shelf, UpdateEvent } from '../lib/types';
import { SHELVES } from '../lib/types';
import {
  CHALLENGE_GOALS,
  GOODREADS_PROFILE_URL,
  SANITY_MAX_SHRINK_RATIO,
} from '../lib/config';
import { fetchAllBooks } from './lib/rss';
import { loadCsvSeed } from './lib/csv';
import { fetchUpdates } from './lib/updates';
import { fetchProfileProgress } from './lib/profile';

const DATA_DIR = path.join(process.cwd(), 'data');
const SEED_CSV = path.join(DATA_DIR, 'seed', 'goodreads_library_export.csv');
const LIBRARY_JSON = path.join(DATA_DIR, 'library.json');
const UPDATES_JSON = path.join(DATA_DIR, 'updates.json');
const META_JSON = path.join(DATA_DIR, 'meta.json');

const DRY_RUN = process.argv.includes('--dry');
const warnings: string[] = [];

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function warn(message: string) {
  warnings.push(message);
  console.warn(`  ! ${message}`);
}

/**
 * Merge precedence, by source strength per field:
 *  - RSS wins on live fields (ratings, dates, tags, review, cover, avg rating).
 *  - CSV wins on `shelf` (the only clean exclusive-shelf signal), on
 *    `publishedYear` (original publication rather than edition year), and on
 *    `readCount` (absent from RSS entirely).
 *  - CSV fills any gap RSS leaves null.
 */
function merge(rss: Book, csv: Partial<Book> | undefined): Book {
  if (!csv) return rss;
  return {
    ...rss,
    isbn: rss.isbn ?? csv.isbn ?? null,
    pages: rss.pages ?? csv.pages ?? null,
    publishedYear: csv.publishedYear ?? rss.publishedYear,
    myRating: rss.myRating ?? csv.myRating ?? null,
    dateRead: rss.dateRead ?? csv.dateRead ?? null,
    // Re-reads: RSS reports the latest read, the CSV an earlier one. Keep both.
    previousReadDate:
      rss.dateRead && csv.dateRead && rss.dateRead !== csv.dateRead ? csv.dateRead : null,
    dateAdded: rss.dateAdded ?? csv.dateAdded ?? null,
    tags: rss.tags.length > 0 ? rss.tags : csv.tags ?? [],
    review: rss.review ?? csv.review ?? null,
    shelf: csv.shelf ?? rss.shelf,
    readCount: csv.readCount ?? rss.readCount,
  };
}

/** A CSV row with no RSS counterpart still belongs in the library. */
function fromCsvOnly(csv: Partial<Book> & { bookId: string }): Book {
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
    removedAt: null,
  };
}

async function main() {
  const startedAt = new Date();
  console.log(`\nbookshelf sync — ${startedAt.toISOString()}${DRY_RUN ? ' (dry run)' : ''}\n`);

  const key = process.env.GOODREADS_RSS_KEY ?? null;
  if (!key) {
    console.log('  no GOODREADS_RSS_KEY set — using the public per-shelf feed');
  }

  // --- books ---------------------------------------------------------------
  console.log('  fetching #ALL# shelf feed…');
  const rssBooks = await fetchAllBooks(key);
  console.log(`    ${rssBooks.length} books from RSS`);

  const csvSeed = loadCsvSeed(SEED_CSV);
  console.log(`    ${csvSeed.size} books from the CSV export`);
  if (csvSeed.size === 0) warn('CSV export missing — read dates and page counts will have gaps');

  const merged: Book[] = [];
  const usedCsv = new Set<string>();
  let dateDisagreements = 0;

  for (const book of rssBooks) {
    const csv = csvSeed.get(book.bookId);
    if (csv) {
      usedCsv.add(book.bookId);
      // A mismatch on a book read once would mean a parser bug; on a re-read it
      // just means the two sources picked different reads.
      if (
        book.dateRead &&
        csv.dateRead &&
        book.dateRead !== csv.dateRead &&
        (csv.readCount ?? 1) <= 1
      ) {
        dateDisagreements++;
      }
    }
    merged.push(merge(book, csv));
  }

  for (const [bookId, csv] of csvSeed) {
    if (!usedCsv.has(bookId)) merged.push(fromCsvOnly(csv));
  }

  if (dateDisagreements > 0) {
    warn(
      `${dateDisagreements} singly-read books disagree on read date between RSS and CSV`,
    );
  }

  // --- updates feed (append-only) -----------------------------------------
  // Rolling window of ~10 events that cannot be backfilled, so it accumulates.
  const previousUpdates = readJson<UpdateEvent[]>(UPDATES_JSON, []);
  let updates = previousUpdates;
  let updatesOk = false;
  try {
    const fresh = await fetchUpdates();
    const byGuid = new Map(previousUpdates.map((e) => [e.guid, e]));
    let added = 0;
    for (const event of fresh) {
      if (!byGuid.has(event.guid)) {
        byGuid.set(event.guid, event);
        added++;
      }
    }
    updates = [...byGuid.values()].sort((a, b) => a.at.localeCompare(b.at));
    updatesOk = true;
    console.log(`  updates feed: ${fresh.length} events, ${added} new (${updates.length} total)`);
  } catch (error) {
    warn(`updates feed failed: ${(error as Error).message}`);
  }

  // --- progress ------------------------------------------------------------
  // Two sources, both partial. Latest timestamp wins.
  const progressByBook = new Map<string, Progress>();
  const newer = (a: string | null, b: string | null) => (a ?? '') > (b ?? '');

  for (const event of updates) {
    if (event.type !== 'progress' || !event.bookId || event.page === null || !event.of) continue;
    const existing = progressByBook.get(event.bookId);
    if (!existing || newer(event.at, existing.at)) {
      progressByBook.set(event.bookId, { page: event.page, of: event.of, at: event.at });
    }
  }

  let profileOk = false;
  try {
    const scraped = await fetchProfileProgress();
    for (const [bookId, progress] of scraped) {
      const existing = progressByBook.get(bookId);
      if (!existing || newer(progress.at, existing.at)) progressByBook.set(bookId, progress);
    }
    profileOk = true;
    console.log(`  profile widget: progress for ${scraped.size} books`);
  } catch (error) {
    warn(`profile progress scrape failed (non-fatal): ${(error as Error).message}`);
  }

  // --- carry forward anything that vanished upstream -----------------------
  const previous = readJson<Library>(LIBRARY_JSON, { books: [] });
  const byBookId = new Map(merged.map((b) => [b.bookId, b]));
  const today = startedAt.toISOString().slice(0, 10);

  for (const old of previous.books) {
    if (!byBookId.has(old.bookId)) {
      // Never delete: a book removed from Goodreads stays in the archive.
      byBookId.set(old.bookId, { ...old, removedAt: old.removedAt ?? today });
    }
  }

  const books = [...byBookId.values()].map((book) => ({
    ...book,
    progress: progressByBook.get(book.bookId) ?? book.progress ?? null,
  }));

  // Stable key order keeps git diffs to only what actually changed.
  books.sort((a, b) => a.bookId.localeCompare(b.bookId));

  // --- sanity gate ---------------------------------------------------------
  // A layout change or a Cloudflare block must fail loudly, not silently wipe
  // the page. Stale data beats empty data.
  const counts = SHELVES.reduce(
    (acc, shelf) => ({ ...acc, [shelf]: books.filter((b) => b.shelf === shelf).length }),
    {} as Record<Shelf, number>,
  );
  const live = books.filter((b) => !b.removedAt);

  if (live.length === 0) throw new Error('sanity: zero live books — refusing to write');
  if (counts.read === 0) throw new Error('sanity: read shelf is empty — refusing to write');

  const previousRead = previous.books.filter((b) => b.shelf === 'read' && !b.removedAt).length;
  if (previousRead > 0) {
    const shrink = (previousRead - counts.read) / previousRead;
    if (shrink > SANITY_MAX_SHRINK_RATIO) {
      throw new Error(
        `sanity: read shelf shrank ${(shrink * 100).toFixed(1)}% ` +
          `(${previousRead} -> ${counts.read}) — refusing to write`,
      );
    }
  }

  // --- challenge -----------------------------------------------------------
  // Verified against Goodreads: counting read-shelf books whose dateRead falls
  // in the current year reproduces the number its own widget shows.
  const year = startedAt.getFullYear();
  const completed = books.filter(
    (b) => b.shelf === 'read' && b.dateRead?.startsWith(String(year)),
  ).length;

  const missingDates = books.filter((b) => b.shelf === 'read' && !b.dateRead).length;
  if (missingDates > 0) {
    warn(`${missingDates} read books have no read date — excluded from per-year charts`);
  }

  const meta: Meta = {
    syncedAt: startedAt.toISOString(),
    profileUrl: GOODREADS_PROFILE_URL,
    counts: { ...counts, total: live.length },
    challenge: { year, goal: CHALLENGE_GOALS[year] ?? null, completed },
    sources: { rss: true, csvSeed: csvSeed.size > 0, profileHtml: profileOk, updates: updatesOk },
    warnings,
  };

  console.log('\n  ' + JSON.stringify(meta.counts));
  console.log(`  challenge ${year}: ${completed} of ${meta.challenge.goal ?? '?'}`);
  console.log(`  progress bars available for ${progressByBook.size} books`);

  if (DRY_RUN) {
    console.log('\n  dry run — nothing written\n');
    return;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LIBRARY_JSON, JSON.stringify({ books } satisfies Library, null, 2) + '\n');
  fs.writeFileSync(UPDATES_JSON, JSON.stringify(updates, null, 2) + '\n');
  fs.writeFileSync(META_JSON, JSON.stringify(meta, null, 2) + '\n');

  console.log(`\n  wrote ${books.length} books to data/\n`);
}

main().catch((error) => {
  console.error(`\nsync failed: ${(error as Error).message}\n`);
  process.exit(1);
});
