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

/**
 * What every grouping on the page reports. Charts switch between `books` and
 * `pages` without regrouping, and list `members` on hover.
 */
export interface Bucket {
  books: number;
  /** Sum of known page counts — a floor, not a total. */
  pages: number;
  /** Books here with no page count, so `pages` can be qualified honestly. */
  booksMissingPages: number;
  members: Book[];
}

function summarize(members: Book[]): Bucket {
  return {
    books: members.length,
    pages: members.reduce((sum, b) => sum + (b.pages ?? 0), 0),
    booksMissingPages: members.filter((b) => b.pages === null).length,
    members,
  };
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

export interface YearStats extends Bucket {
  year: number;
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

  if (buckets.size === 0) return [];

  // Fill the gaps: a year with nothing read must show as zero, not vanish.
  // Omitting it spaces the bars evenly and makes a broken run look continuous.
  const years = [...buckets.keys()];
  const [first, last] = [Math.min(...years), Math.max(...years)];
  for (let year = first; year <= last; year++) {
    if (!buckets.has(year)) buckets.set(year, []);
  }

  return [...buckets.entries()]
    .map(([year, members]) => {
      const rated = members.filter((b) => b.myRating !== null);
      return {
        ...summarize(members),
        year,
        averageRating:
          rated.length > 0
            ? rated.reduce((s, b) => s + (b.myRating ?? 0), 0) / rated.length
            : null,
      };
    })
    .sort((a, b) => a.year - b.year);
}

export interface MonthStats extends Bucket {
  /** 1-12 */
  month: number;
}

export function booksPerMonth(books: Book[], year: number): MonthStats[] {
  const months: Book[][] = Array.from({ length: 12 }, () => []);

  for (const book of readBooks(books)) {
    if (!book.dateRead || yearOf(book.dateRead) !== year) continue;
    const month = Number.parseInt(book.dateRead.slice(5, 7), 10);
    months[month - 1]?.push(book);
  }

  return months.map((members, i) => ({ ...summarize(members), month: i + 1 }));
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

export interface RatingBucket extends Bucket {
  rating: number;
}

export interface RatingStats {
  histogram: RatingBucket[];
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
    ...summarize(rated.filter((b) => b.myRating === rating)),
    rating,
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

export interface Tally extends Bucket {
  label: string;
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
    .map(([label, members]) => {
      const rated = members.filter((b) => b.myRating !== null);
      return {
        ...summarize(members),
        label,
        averageRating:
          rated.length > 0
            ? rated.reduce((s, b) => s + (b.myRating ?? 0), 0) / rated.length
            : null,
      };
    })
    .sort((a, b) => b.books - a.books || a.label.localeCompare(b.label));
}

export const topAuthors = (books: Book[], limit = 10): Tally[] =>
  tally(readBooks(books), (b) => [b.author]).slice(0, limit);

export const topTags = (books: Book[], limit = 12): Tally[] =>
  tally(readBooks(books), (b) => b.tags).slice(0, limit);

export interface DecadeBucket extends Bucket {
  label: string;
  /** Lower bound, for sorting and axis order. */
  from: number;
}

export interface PublicationSpread {
  buckets: DecadeBucket[];
  /** Books dropped for being older than the floor — reported, not hidden. */
  excluded: number;
}

/**
 * How old the books you read are, by decade of publication.
 *
 * Anything published before `floorYear` is dropped rather than plotted: the
 * library reaches back to 500 BC, and those few books stretch the axis so far
 * that the modern decades — where almost everything actually sits — compress
 * into nothing. The count of what was dropped is returned so the chart can say so.
 */
export function publicationBuckets(books: Book[], floorYear = 1900): PublicationSpread {
  const groups = new Map<number, Book[]>();
  let excluded = 0;

  for (const book of readBooks(books)) {
    if (book.publishedYear === null) continue;
    if (book.publishedYear < floorYear) {
      excluded += 1;
      continue;
    }
    const decade = Math.floor(book.publishedYear / 10) * 10;
    const group = groups.get(decade);
    if (group) group.push(book);
    else groups.set(decade, [book]);
  }

  return {
    excluded,
    buckets: [...groups.entries()]
      .map(([from, members]) => ({ ...summarize(members), from, label: `${from}s` }))
      .sort((a, b) => a.from - b.from),
  };
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
