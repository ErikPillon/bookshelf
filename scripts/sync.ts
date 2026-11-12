/**
 * Fetches Goodreads data, normalizes it, and writes data/*.json.
 *
 * Runs in CI (and locally). Never runs at request time — the site reads the
 * committed JSON, so the page cannot break when Goodreads is slow or blocking.
 *
 *   npm run sync            fetch + write
 *   npm run sync -- --dry   fetch + report, write nothing
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Book, Library, Meta, Progress, Shelf, UpdateEvent } from '../lib/types';
import { SHELVES } from '../lib/types';
import {
  CHALLENGE_GOALS,
  GOODREADS_PROFILE_URL,
  SANITY_MAX_SHRINK_RATIO,
} from '../lib/config';
import { FeedUnavailableError, fetchAllBooks } from './lib/rss';
import { loadCsvSeed } from './lib/csv';
import { fetchUpdates } from './lib/updates';
import { fetchProfileProgress } from './lib/profile';
import {
  exportIsFresh,
  fromCsvOnly,
  mergeBook,
  mergeCsvOverStored,
} from './lib/merge';

const DATA_DIR = path.join(process.cwd(), 'data');
const SEED_CSV = path.join(DATA_DIR, 'seed', 'goodreads_library_export.csv');
const LIBRARY_JSON = path.join(DATA_DIR, 'library.json');
const UPDATES_JSON = path.join(DATA_DIR, 'updates.json');
const META_JSON = path.join(DATA_DIR, 'meta.json');

const DRY_RUN = process.argv.includes('--dry');
const warnings: string[] = [];

/** Identifies the export, so a sync knows whether a new one has been added. */
function hashFile(file: string): string | null {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

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

async function main() {
  const startedAt = new Date();
  console.log(`\nbookshelf sync — ${startedAt.toISOString()}${DRY_RUN ? ' (dry run)' : ''}\n`);

  const key = process.env.GOODREADS_RSS_KEY ?? null;
  if (!key) {
    console.log('  no GOODREADS_RSS_KEY set — using the public per-shelf feed');
  }

  // --- books ---------------------------------------------------------------
  // Everything already stored. This is the floor: a sync may enrich or replace
  // it, but must never lose it.
  const previous = readJson<Library>(LIBRARY_JSON, { books: [] });
  const storedByBookId = new Map(previous.books.map((b) => [b.bookId, b]));

  const csvSeed = loadCsvSeed(SEED_CSV);
  const csvHash = hashFile(SEED_CSV);
  const previousMeta = readJson<Meta | null>(META_JSON, null);

  const today = startedAt.toISOString().slice(0, 10);
  const merged: Book[] = [];
  let rssAvailable = true;

  console.log('  fetching #ALL# shelf feed…');
  let rssBooks: Book[] = [];
  try {
    rssBooks = await fetchAllBooks(key);
    console.log(`    ${rssBooks.length} books from RSS`);
  } catch (error) {
    // A retired endpoint is not a transient failure, and failing the run every
    // day would only produce noise. Anything else still aborts, because
    // retrying is the right answer to a 5xx or a dropped connection.
    if (!(error instanceof FeedUnavailableError)) throw error;
    rssAvailable = false;
    console.log('    RSS feed unavailable — falling back to the library export');
  }

  console.log(`    ${csvSeed.size} books from the CSV export`);

  if (rssAvailable) {
    // Normal path: RSS is live, the export gap-fills.
    const usedCsv = new Set<string>();
    let dateDisagreements = 0;

    for (const book of rssBooks) {
      const csv = csvSeed.get(book.bookId);
      if (csv) {
        usedCsv.add(book.bookId);
        // A mismatch on a book read once would mean a parser bug; on a re-read
        // it just means the two sources picked different reads.
        if (
          book.dateRead &&
          csv.dateRead &&
          book.dateRead !== csv.dateRead &&
          (csv.readCount ?? 1) <= 1
        ) {
          dateDisagreements++;
        }
      }
      merged.push(mergeBook(book, csv));
    }

    for (const [bookId, csv] of csvSeed) {
      if (!usedCsv.has(bookId)) merged.push(fromCsvOnly(csv, today));
    }

    if (dateDisagreements > 0) {
      warn(`${dateDisagreements} singly-read books disagree on read date between RSS and CSV`);
    }
    if (csvSeed.size === 0) {
      warn('CSV export missing — read dates and page counts will have gaps');
    }
  } else if (csvSeed.size === 0) {
    // No feed and no export: there is nothing to read the library from. Keep
    // what is stored rather than writing an empty one.
    merged.push(...previous.books);
    warn(
      'Goodreads has retired its RSS feeds and no library export is present — ' +
        'this page cannot update until an export is added to data/seed/',
    );
  } else if (!exportIsFresh(csvSeed.values(), previous.books)) {
    // The export predates what we already hold, so ingesting it would walk the
    // library backwards. Keep the stored books and say so.
    merged.push(...previous.books);
    console.log('    export is older than the stored data — keeping stored books');
    warn(
      'Goodreads has retired its RSS feeds, and the library export in data/seed/ ' +
        'is older than the reading data already stored. Add a fresh export to ' +
        'update this page.',
    );
  } else if (csvHash === previousMeta?.csvHash) {
    // The export has not changed since it was last ingested, so re-merging it
    // would only churn. Progress scraping below still runs.
    merged.push(...previous.books);
    console.log('    export unchanged since the last sync — keeping stored books');
    warn(
      'Goodreads has retired its RSS feeds. Reading data comes from the library ' +
        `export of ${previousMeta?.csvIngestedAt ?? 'an earlier date'} — add a fresh ` +
        'export to data/seed/ to update it.',
    );
  } else {
    // A new export has landed: it is now the live source and owns every field
    // it carries. Stored books supply only covers and community ratings, which
    // the export has no column for.
    for (const [bookId, csv] of csvSeed) {
      merged.push(mergeCsvOverStored(csv, storedByBookId.get(bookId)));
    }
    console.log(`    ingested a new export (${csvSeed.size} books)`);
    warn(
      'Goodreads has retired its RSS feeds. Reading data comes from the library ' +
        `export added on ${today}.`,
    );
  }

  // --- updates feed (append-only) -----------------------------------------
  // Rolling window of ~10 events that cannot be backfilled, so it accumulates.
  const previousUpdates = readJson<UpdateEvent[]>(UPDATES_JSON, []);
  let updates = previousUpdates;
  let updatesOk = false;
  try {
    // The updates feed was retired alongside the shelf feed. Skip it rather
    // than reporting the same outage twice in the footer.
    if (!rssAvailable) throw new FeedUnavailableError('retired alongside the shelf feed');

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
    if (!(error instanceof FeedUnavailableError)) {
      warn(`updates feed failed: ${(error as Error).message}`);
    }
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
  const byBookId = new Map(merged.map((b) => [b.bookId, b]));

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
  const live = books.filter((b) => !b.removedAt);
  const counts = SHELVES.reduce(
    (acc, shelf) => ({ ...acc, [shelf]: live.filter((b) => b.shelf === shelf).length }),
    {} as Record<Shelf, number>,
  );

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
    sources: { rss: rssAvailable, csvSeed: csvSeed.size > 0, profileHtml: profileOk, updates: updatesOk },
    csvHash,
    csvIngestedAt:
      csvHash && csvHash !== previousMeta?.csvHash ? today : (previousMeta?.csvIngestedAt ?? null),
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
