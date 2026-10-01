import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import type { Book, Shelf } from '../../lib/types';
import { parseCsvDate } from './dates';

const EXCLUSIVE = new Set(['read', 'currently-reading', 'to-read', 'did-not-finish']);

/** Goodreads wraps ISBNs as `="1982172002"` to stop spreadsheets eating them. */
function cleanIsbn(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/^="?|"?$/g, '').trim();
  return s === '' ? null : s;
}

function str(raw: string | undefined): string | null {
  const s = raw?.trim();
  return !s ? null : s;
}

function int(raw: string | undefined): number | null {
  const s = str(raw);
  if (s === null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

interface CsvRow {
  'Book Id': string;
  Title: string;
  Author: string;
  ISBN: string;
  ISBN13: string;
  'My Rating': string;
  'Number of Pages': string;
  'Year Published': string;
  'Original Publication Year': string;
  'Date Read': string;
  'Date Added': string;
  Bookshelves: string;
  'Exclusive Shelf': string;
  'My Review': string;
  'Read Count': string;
}

/**
 * The library export is the authoritative baseline: it is the only source with
 * a clean "Exclusive Shelf" column, original publication years, and read counts.
 * It has no review id, so it keys on bookId.
 *
 * Returns an empty map when the file is absent — the sync degrades to RSS only.
 */
export function loadCsvSeed(path: string): Map<string, Partial<Book> & { bookId: string }> {
  const out = new Map<string, Partial<Book> & { bookId: string }>();
  if (!fs.existsSync(path)) return out;

  const rows = parse(fs.readFileSync(path), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as CsvRow[];

  for (const row of rows) {
    const bookId = str(row['Book Id']);
    if (!bookId) continue;

    const rating = int(row['My Rating']);
    const shelf = str(row['Exclusive Shelf']);
    const tags = (str(row.Bookshelves) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !EXCLUSIVE.has(s));

    out.set(bookId, {
      bookId,
      title: str(row.Title)?.replace(/\s+/g, ' '),
      author: str(row.Author)?.replace(/\s+/g, ' '),
      isbn: cleanIsbn(row.ISBN) ?? cleanIsbn(row.ISBN13),
      pages: int(row['Number of Pages']),
      // Prefer when the work was written over when this edition was printed.
      publishedYear:
        int(row['Original Publication Year']) ?? int(row['Year Published']),
      myRating: rating && rating > 0 ? rating : null,
      dateRead: parseCsvDate(row['Date Read']),
      dateAdded: parseCsvDate(row['Date Added']),
      tags,
      review: str(row['My Review']),
      shelf: shelf && EXCLUSIVE.has(shelf) ? (shelf as Shelf) : undefined,
      readCount: int(row['Read Count']) ?? 1,
    });
  }

  return out;
}
