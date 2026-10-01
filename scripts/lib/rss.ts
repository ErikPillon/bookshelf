import { XMLParser } from 'fast-xml-parser';
import type { Book, Shelf } from '../../lib/types';
import { GOODREADS_USER_ID, REQUEST_DELAY_MS } from '../../lib/config';
import { parseFeedDate, sleep } from './dates';

const USER_AGENT = 'bookshelf-sync/0.1 (+personal reading stats; one request per page)';
const PER_PAGE = 100;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false, // keep everything a string; we parse deliberately
  trimValues: true,
});

/** fast-xml-parser collapses a single <item> to an object instead of an array. */
function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function int(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function float(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Goodreads does not report the exclusive shelf as such. It leaks through
 * user_shelves for three of the four, and `read` is the absence of the others.
 * The CSV export's "Exclusive Shelf" column overrides this where available.
 */
function inferShelf(tags: string[]): Shelf {
  if (tags.includes('currently-reading')) return 'currently-reading';
  if (tags.includes('to-read')) return 'to-read';
  if (tags.includes('did-not-finish')) return 'did-not-finish';
  return 'read';
}

const EXCLUSIVE = new Set(['read', 'currently-reading', 'to-read', 'did-not-finish']);

interface RssItem {
  guid?: string;
  title?: string;
  book_id?: string;
  book_large_image_url?: string;
  book_medium_image_url?: string;
  book_image_url?: string;
  book?: { '@_id'?: string; num_pages?: string };
  author_name?: string;
  isbn?: string;
  user_rating?: string;
  user_read_at?: string;
  user_date_added?: string;
  user_date_created?: string;
  user_shelves?: string;
  user_review?: string;
  average_rating?: string;
  book_published?: string;
}

function toBook(item: RssItem): Book | null {
  const guid = str(item.guid);
  const reviewId = guid ? /review\/show\/(\d+)/.exec(guid)?.[1] ?? null : null;
  const bookId = str(item.book_id);
  if (!reviewId || !bookId) return null;

  const allShelves = (str(item.user_shelves) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const rating = int(item.user_rating);

  return {
    reviewId,
    bookId,
    // Author names arrive with collapsed-out middle names: "Chris   Miller".
    title: (str(item.title) ?? 'Untitled').replace(/\s+/g, ' '),
    author: (str(item.author_name) ?? 'Unknown').replace(/\s+/g, ' '),
    isbn: str(item.isbn),
    // num_pages is nested inside <book id="...">, not a top-level field.
    pages: int(item.book?.num_pages),
    publishedYear: int(item.book_published),
    myRating: rating && rating > 0 ? rating : null,
    avgRating: float(item.average_rating),
    dateRead: parseFeedDate(str(item.user_read_at)),
    previousReadDate: null,
    dateAdded: parseFeedDate(str(item.user_date_added)),
    dateFirstAdded: parseFeedDate(str(item.user_date_created)),
    tags: allShelves.filter((s) => !EXCLUSIVE.has(s)),
    review: str(item.user_review),
    coverUrl:
      str(item.book_large_image_url) ??
      str(item.book_medium_image_url) ??
      str(item.book_image_url),
    shelf: inferShelf(allShelves),
    readCount: 1,
    progress: null,
    removedAt: null,
  };
}

async function fetchPage(key: string | null, page: number): Promise<RssItem[]> {
  const url = new URL(`https://www.goodreads.com/review/list_rss/${GOODREADS_USER_ID}`);
  url.searchParams.set('shelf', '#ALL#');
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('page', String(page));
  if (key) url.searchParams.set('key', key);

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Goodreads returned ${res.status} ${res.statusText} for page ${page}`);
  }
  const xml = await res.text();
  const doc = parser.parse(xml);
  return asArray<RssItem>(doc?.rss?.channel?.item);
}

/**
 * Walk every page of the #ALL# shelf feed. One feed covers all four shelves,
 * which beats four separate paginated feeds.
 */
export async function fetchAllBooks(key: string | null): Promise<Book[]> {
  const books: Book[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= 50; page++) {
    const items = await fetchPage(key, page);

    for (const item of items) {
      const book = toBook(item);
      // Goodreads occasionally repeats an entry across page boundaries.
      if (book && !seen.has(book.reviewId)) {
        seen.add(book.reviewId);
        books.push(book);
      }
    }

    if (items.length < PER_PAGE) break;
    await sleep(REQUEST_DELAY_MS);
  }

  return books;
}
