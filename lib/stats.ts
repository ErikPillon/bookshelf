/**
 * Derived statistics. Pure functions over Book[] — nothing here fetches, reads
 * files, or depends on "now" except through an injected date, so it is all
 * directly testable.
 */
import type { Book, Shelf } from './types';
import { PARKED_AFTER_DAYS } from './config';

const DAY_MS = 86_400_000;

export const readBooks = (books: Book[]): Book[] =>
  books.filter((b) => b.shelf === 'read' && !b.removedAt);

const yearOf = (date: string | null): number | null =>
  date ? Number.parseInt(date.slice(0, 4), 10) : null;

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / DAY_MS) + 1;
}

// --- challenge --------------------------------------------------------------

export interface ChallengeStats {
  year: number;
  goal: number | null;
  completed: number;
  remaining: number | null;
  percent: number | null;
  /** Books you'd need by today to be exactly on a linear pace. */
  target: number | null;
  /** completed - target. Negative means behind. */
  delta: number | null;
  /** Year-end total if the current rate holds. */
  projected: number | null;
  /** Books per week needed from here to still finish. */
  neededPerWeek: number | null;
  daysLeft: number;
}

export function challengeStats(
  books: Book[],
  goal: number | null,
  now: Date,
): ChallengeStats {
  const year = now.getUTCFullYear();
  const total = daysInYear(year);
  const day = dayOfYear(now);
  const daysLeft = total - day;

  const completed = readBooks(books).filter((b) => yearOf(b.dateRead) === year).length;

  if (goal === null || goal <= 0) {
    return {
      year, goal: null, completed, remaining: null, percent: null,
      target: null, delta: null, projected: null, neededPerWeek: null, daysLeft,
    };
  }

  const target = (goal * day) / total;
  const remaining = Math.max(0, goal - completed);

  return {
    year,
    goal,
    completed,
    remaining,
    percent: Math.min(100, (completed / goal) * 100),
    target: Math.round(target),
    delta: completed - Math.round(target),
    projected: Math.round((completed / day) * total),
    neededPerWeek: daysLeft > 0 ? (remaining / daysLeft) * 7 : null,
    daysLeft,
  };
}

// --- per-year / per-month ---------------------------------------------------

export interface YearStats {
  year: number;
  books: number;
  pages: number;
  /** Books in this year whose page count is unknown — pages is a floor, not a total. */
  booksMissingPages: number;
  averageRating: number | null;
}

export function booksPerYear(books: Book[]): YearStats[] {
  const buckets = new Map<number, Book[]>();

  for (const book of readBooks(books)) {
    const year = yearOf(book.dateRead);
    if (year === null) continue;
    const bucket = buckets.get(year);
    if (bucket) bucket.push(book);
    else buckets.set(year, [book]);
  }

  return [...buckets.entries()]
    .map(([year, bucket]) => {
      const rated = bucket.filter((b) => b.myRating !== null);
      return {
        year,
        books: bucket.length,
        pages: bucket.reduce((sum, b) => sum + (b.pages ?? 0), 0),
        booksMissingPages: bucket.filter((b) => b.pages === null).length,
        averageRating:
          rated.length > 0
            ? rated.reduce((s, b) => s + (b.myRating ?? 0), 0) / rated.length
            : null,
      };
    })
    .sort((a, b) => a.year - b.year);
}

export interface MonthStats {
  /** 1-12 */
  month: number;
  books: number;
  pages: number;
}

export function booksPerMonth(books: Book[], year: number): MonthStats[] {
  const months: MonthStats[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    books: 0,
    pages: 0,
  }));

  for (const book of readBooks(books)) {
    if (!book.dateRead || yearOf(book.dateRead) !== year) continue;
    const month = Number.parseInt(book.dateRead.slice(5, 7), 10);
    const bucket = months[month - 1];
    if (!bucket) continue;
    bucket.books += 1;
    bucket.pages += book.pages ?? 0;
  }

  return months;
}

/** Longest run of consecutive months, ending at or before `year`-`month`, with at least one book finished. */
export function currentMonthStreak(books: Book[], now: Date): number {
  const finished = new Set(
    readBooks(books)
      .map((b) => b.dateRead?.slice(0, 7))
      .filter((v): v is string => Boolean(v)),
  );

  let streak = 0;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // An empty current month shouldn't zero out a streak that is otherwise alive,
  // so start counting from the most recent month that has a book.
  if (!finished.has(cursor.toISOString().slice(0, 7))) {
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  while (finished.has(cursor.toISOString().slice(0, 7))) {
    streak += 1;
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  return streak;
}

// --- ratings ----------------------------------------------------------------

export interface RatingStats {
  histogram: { rating: number; count: number }[];
  myAverage: number | null;
  /** Community average across the same books, so the two are comparable. */
  communityAverage: number | null;
  rated: number;
  unrated: number;
  /** myAverage - communityAverage. Positive means you rate more generously. */
  delta: number | null;
}

export function ratingStats(books: Book[]): RatingStats {
  const read = readBooks(books);
  const rated = read.filter((b) => b.myRating !== null);

  const histogram = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: rated.filter((b) => b.myRating === rating).length,
  }));

  const myAverage =
    rated.length > 0 ? rated.reduce((s, b) => s + (b.myRating ?? 0), 0) / rated.length : null;

  // Only books that have both numbers, or the comparison is meaningless.
  const comparable = rated.filter((b) => b.avgRating !== null);
  const communityAverage =
    comparable.length > 0
      ? comparable.reduce((s, b) => s + (b.avgRating ?? 0), 0) / comparable.length
      : null;
  const myComparable =
    comparable.length > 0
      ? comparable.reduce((s, b) => s + (b.myRating ?? 0), 0) / comparable.length
      : null;

  return {
    histogram,
    myAverage,
    communityAverage,
    rated: rated.length,
    unrated: read.length - rated.length,
    delta:
      myComparable !== null && communityAverage !== null
        ? myComparable - communityAverage
        : null,
  };
}

// --- groupings --------------------------------------------------------------

export interface Tally {
  label: string;
  count: number;
  /** Mean of your ratings within this group, where any are rated. */
  averageRating: number | null;
}

function tally(books: Book[], keys: (b: Book) => string[]): Tally[] {
  const groups = new Map<string, Book[]>();

  for (const book of books) {
    for (const key of keys(book)) {
      const group = groups.get(key);
      if (group) group.push(book);
      else groups.set(key, [book]);
    }
  }

  return [...groups.entries()]
    .map(([label, group]) => {
      const rated = group.filter((b) => b.myRating !== null);
      return {
        label,
        count: group.length,
        averageRating:
          rated.length > 0
            ? rated.reduce((s, b) => s + (b.myRating ?? 0), 0) / rated.length
            : null,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const topAuthors = (books: Book[], limit = 10): Tally[] =>
  tally(readBooks(books), (b) => [b.author]).slice(0, limit);

export const topTags = (books: Book[], limit = 12): Tally[] =>
  tally(readBooks(books), (b) => b.tags).slice(0, limit);

export interface DecadeBucket {
  label: string;
  /** Lower bound, for sorting and axis order. */
  from: number;
  count: number;
}

/**
 * How old the books you read are. Everything before `floorYear` collapses into
 * one bucket: a linear decade axis running from 500 BC to the 2020s devotes
 * most of its width to buckets holding a single book.
 */
export function publicationBuckets(books: Book[], floorYear = 1900): DecadeBucket[] {
  const counts = new Map<number, number>();
  const PRE = floorYear - 10;

  for (const book of readBooks(books)) {
    if (book.publishedYear === null) continue;
    const decade =
      book.publishedYear < floorYear ? PRE : Math.floor(book.publishedYear / 10) * 10;
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([from, count]) => ({
      from,
      count,
      label: from === PRE ? `Pre-${floorYear}` : `${from}s`,
    }))
    .sort((a, b) => a.from - b.from);
}

/** Formats a publication year, including the BC years in the library. */
export function formatYear(year: number | null): string {
  if (year === null) return 'Unknown';
  return year < 0 ? `${Math.abs(year)} BC` : String(year);
}

// --- currently reading ------------------------------------------------------

export interface ActiveBook {
  book: Book;
  /** 0-100 where a status update exists, else null. */
  percent: number | null;
  daysSinceActivity: number | null;
  parked: boolean;
}

export function currentlyReading(books: Book[], now: Date): ActiveBook[] {
  const active = books.filter((b) => b.shelf === 'currently-reading' && !b.removedAt);

  return active
    .map((book) => {
      // Last sign of life: a status update if we have one, else the shelf date.
      const lastActivity = book.progress?.at ?? book.dateAdded;
      const daysSinceActivity = lastActivity
        ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / DAY_MS)
        : null;

      const percent =
        book.progress && book.progress.of > 0
          ? Math.min(100, (book.progress.page / book.progress.of) * 100)
          : null;

      return {
        book,
        percent,
        daysSinceActivity,
        parked: daysSinceActivity !== null && daysSinceActivity > PARKED_AFTER_DAYS,
      };
    })
    .sort((a, b) => {
      // Live books first, then by most recent activity.
      if (a.parked !== b.parked) return a.parked ? 1 : -1;
      return (a.daysSinceActivity ?? 1e9) - (b.daysSinceActivity ?? 1e9);
    });
}

// --- totals and extremes ----------------------------------------------------

export interface Totals {
  read: number;
  pages: number;
  booksMissingPages: number;
  averagePages: number | null;
  shelves: Record<Shelf, number>;
  rereads: number;
}

export function totals(books: Book[]): Totals {
  const read = readBooks(books);
  const withPages = read.filter((b) => b.pages !== null);
  const live = books.filter((b) => !b.removedAt);

  return {
    read: read.length,
    pages: withPages.reduce((s, b) => s + (b.pages ?? 0), 0),
    booksMissingPages: read.length - withPages.length,
    averagePages:
      withPages.length > 0
        ? withPages.reduce((s, b) => s + (b.pages ?? 0), 0) / withPages.length
        : null,
    shelves: {
      read: live.filter((b) => b.shelf === 'read').length,
      'currently-reading': live.filter((b) => b.shelf === 'currently-reading').length,
      'to-read': live.filter((b) => b.shelf === 'to-read').length,
      'did-not-finish': live.filter((b) => b.shelf === 'did-not-finish').length,
    },
    rereads: read.filter((b) => b.readCount > 1).length,
  };
}

export interface Extremes {
  longest: Book | null;
  shortest: Book | null;
  oldest: Book | null;
  newest: Book | null;
}

export function extremes(books: Book[]): Extremes {
  const read = readBooks(books);
  const withPages = read.filter((b) => b.pages !== null && b.pages > 0);
  const withYear = read.filter((b) => b.publishedYear !== null);

  const minBy = <T>(items: T[], score: (t: T) => number): T | null =>
    items.length === 0 ? null : items.reduce((a, b) => (score(b) < score(a) ? b : a));

  return {
    longest: minBy(withPages, (b) => -(b.pages ?? 0)),
    shortest: minBy(withPages, (b) => b.pages ?? 0),
    oldest: minBy(withYear, (b) => b.publishedYear ?? 0),
    newest: minBy(withYear, (b) => -(b.publishedYear ?? 0)),
  };
}
