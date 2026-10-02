import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Book } from './types';
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
  totals,
} from './stats';

let seq = 0;
function book(overrides: Partial<Book> = {}): Book {
  seq += 1;
  return {
    reviewId: `r${seq}`,
    bookId: `b${seq}`,
    title: `Book ${seq}`,
    author: 'Author',
    isbn: null,
    pages: 300,
    publishedYear: 2000,
    myRating: 4,
    avgRating: 4,
    dateRead: '2026-05-10',
    previousReadDate: null,
    dateAdded: '2026-05-10',
    dateFirstAdded: '2026-01-01',
    tags: [],
    review: null,
    coverUrl: null,
    shelf: 'read',
    readCount: 1,
    progress: null,
    removedAt: null,
    ...overrides,
  };
}

// --- challenge pace ---------------------------------------------------------

test('challenge pace: exactly on a linear target', () => {
  // Day 183 of 365 is just past halfway, so half the goal is on pace.
  const books = Array.from({ length: 26 }, () => book({ dateRead: '2026-03-01' }));
  const stats = challengeStats(books, 52, new Date('2026-07-02T00:00:00Z'));
  assert.equal(stats.completed, 26);
  assert.equal(stats.target, 26);
  assert.equal(stats.delta, 0);
});

test('challenge pace: behind reports a negative delta', () => {
  const books = Array.from({ length: 20 }, () => book({ dateRead: '2026-03-01' }));
  const stats = challengeStats(books, 52, new Date('2026-10-02T00:00:00Z'));
  assert.equal(stats.completed, 20);
  assert.equal(stats.target, 39); // 52 * 275/365
  assert.equal(stats.delta, -19);
  assert.equal(stats.remaining, 32);
  assert.equal(stats.projected, 27); // 20/275 * 365
  assert.equal(stats.daysLeft, 90);
});

test('challenge pace: ahead reports a positive delta', () => {
  const books = Array.from({ length: 50 }, () => book({ dateRead: '2026-02-01' }));
  const stats = challengeStats(books, 52, new Date('2026-07-02T00:00:00Z'));
  assert.equal(stats.delta, 24);
  assert.equal(stats.percent, (50 / 52) * 100);
});

test('challenge pace: handles a leap year', () => {
  // 2028-07-01 is day 183 of 366 — not quite halfway.
  const stats = challengeStats([], 366, new Date('2028-07-01T00:00:00Z'));
  assert.equal(stats.target, 183);
  assert.equal(stats.daysLeft, 183);
});

test('challenge with no configured goal degrades instead of guessing', () => {
  const stats = challengeStats([book()], null, new Date('2026-10-02T00:00:00Z'));
  assert.equal(stats.goal, null);
  assert.equal(stats.completed, 1);
  assert.equal(stats.target, null);
  assert.equal(stats.percent, null);
});

test('challenge counts only the read shelf', () => {
  const books = [
    book({ dateRead: '2026-01-01' }),
    book({ shelf: 'currently-reading', dateRead: '2026-01-01' }),
    book({ shelf: 'did-not-finish', dateRead: '2026-01-01' }),
  ];
  assert.equal(challengeStats(books, 52, new Date('2026-10-02T00:00:00Z')).completed, 1);
});

test('challenge ignores books removed upstream', () => {
  const books = [book({ dateRead: '2026-01-01' }), book({ dateRead: '2026-01-01', removedAt: '2026-02-01' })];
  assert.equal(challengeStats(books, 52, new Date('2026-10-02T00:00:00Z')).completed, 1);
});

// --- year bucketing ---------------------------------------------------------

test('year bucketing skips books with no read date', () => {
  const stats = booksPerYear([
    book({ dateRead: '2024-01-01', pages: 100 }),
    book({ dateRead: '2024-06-01', pages: 200 }),
    book({ dateRead: null }),
  ]);
  assert.deepEqual(
    stats.map((s) => [s.year, s.books, s.pages]),
    [[2024, 2, 300]],
  );
});

test('a year with nothing read still appears, as a zero', () => {
  const stats = booksPerYear([
    book({ dateRead: '2020-01-01' }),
    book({ dateRead: '2023-01-01' }),
  ]);
  assert.deepEqual(
    stats.map((s) => [s.year, s.books]),
    [
      [2020, 1],
      [2021, 0],
      [2022, 0],
      [2023, 1],
    ],
  );
});

test('year bucketing reports missing page counts rather than hiding them', () => {
  const stats = booksPerYear([
    book({ dateRead: '2024-01-01', pages: 100 }),
    book({ dateRead: '2024-02-01', pages: null }),
  ]);
  assert.equal(stats[0]!.pages, 100);
  assert.equal(stats[0]!.booksMissingPages, 1);
});

test('a re-read is counted in the year of its most recent read', () => {
  // dateRead is the latest read; previousReadDate is kept but not bucketed.
  const stats = booksPerYear([
    book({ dateRead: '2026-09-30', previousReadDate: '2024-12-23', readCount: 2 }),
  ]);
  assert.deepEqual(stats.map((s) => s.year), [2026]);
});

test('months come back as a full twelve even when empty', () => {
  const months = booksPerMonth([book({ dateRead: '2026-05-10' })], 2026);
  assert.equal(months.length, 12);
  assert.equal(months[4]!.books, 1);
  assert.equal(months[0]!.books, 0);
});

// --- streaks ----------------------------------------------------------------

test('streak counts consecutive months back from the current one', () => {
  const books = [
    book({ dateRead: '2026-10-02' }),
    book({ dateRead: '2026-09-15' }),
    book({ dateRead: '2026-08-01' }),
    // June breaks it: July is missing.
    book({ dateRead: '2026-06-01' }),
  ];
  assert.equal(currentMonthStreak(books, new Date('2026-10-02T00:00:00Z')), 3);
});

test('an empty current month does not zero a live streak', () => {
  const books = [book({ dateRead: '2026-09-15' }), book({ dateRead: '2026-08-01' })];
  assert.equal(currentMonthStreak(books, new Date('2026-10-02T00:00:00Z')), 2);
});

test('streak crosses a year boundary', () => {
  const books = [book({ dateRead: '2026-01-10' }), book({ dateRead: '2025-12-10' })];
  assert.equal(currentMonthStreak(books, new Date('2026-01-20T00:00:00Z')), 2);
});

test('streak is zero when nothing was finished recently', () => {
  assert.equal(currentMonthStreak([book({ dateRead: '2024-01-01' })], new Date('2026-10-02T00:00:00Z')), 0);
});

// --- ratings ----------------------------------------------------------------

test('rating delta compares only books that have both numbers', () => {
  const stats = ratingStats([
    book({ myRating: 5, avgRating: 4 }),
    book({ myRating: 3, avgRating: 4 }),
    // No community rating: must not drag the comparison.
    book({ myRating: 1, avgRating: null }),
    // Unrated by me: counted as unrated, excluded from averages.
    book({ myRating: null, avgRating: 5 }),
  ]);
  assert.equal(stats.rated, 3);
  assert.equal(stats.unrated, 1);
  assert.equal(stats.communityAverage, 4);
  assert.equal(stats.delta, 0); // (5+3)/2 vs (4+4)/2
});

test('rating histogram covers all five buckets', () => {
  const stats = ratingStats([book({ myRating: 5 }), book({ myRating: 5 })]);
  assert.deepEqual(stats.histogram.map((h) => h.count), [0, 0, 0, 0, 2]);
});

// --- currently reading ------------------------------------------------------

test('a stale currently-reading book is marked parked and sorted last', () => {
  const now = new Date('2026-10-02T00:00:00Z');
  const active = currentlyReading(
    [
      book({ shelf: 'currently-reading', dateAdded: '2024-01-01', title: 'Stale' }),
      book({
        shelf: 'currently-reading',
        dateAdded: '2026-09-28',
        title: 'Fresh',
        progress: { page: 46, of: 293, at: '2026-09-30T22:03:07.000Z' },
      }),
    ],
    now,
  );
  assert.equal(active[0]!.book.title, 'Fresh');
  assert.equal(active[0]!.parked, false);
  assert.ok(Math.abs(active[0]!.percent! - (46 / 293) * 100) < 1e-9);
  assert.equal(active[1]!.book.title, 'Stale');
  assert.equal(active[1]!.parked, true);
  assert.equal(active[1]!.percent, null);
});

// --- totals and extremes ----------------------------------------------------

test('totals treat unknown page counts as unknown, not zero', () => {
  const t = totals([book({ pages: 100 }), book({ pages: null })]);
  assert.equal(t.pages, 100);
  assert.equal(t.booksMissingPages, 1);
  assert.equal(t.averagePages, 100);
});

test('totals count re-reads', () => {
  assert.equal(totals([book({ readCount: 2 }), book({ readCount: 1 })]).rereads, 1);
});

test('extremes ignore books with unknown pages or year', () => {
  const e = extremes([
    book({ title: 'Long', pages: 900, publishedYear: 1999 }),
    book({ title: 'Short', pages: 80, publishedYear: 2020 }),
    book({ title: 'Unknown', pages: null, publishedYear: null }),
  ]);
  assert.equal(e.longest!.title, 'Long');
  assert.equal(e.shortest!.title, 'Short');
  assert.equal(e.oldest!.title, 'Long');
  assert.equal(e.newest!.title, 'Short');
});

test('extremes on an empty library return nulls instead of throwing', () => {
  const e = extremes([]);
  assert.equal(e.longest, null);
  assert.equal(e.oldest, null);
});

// --- publication buckets ----------------------------------------------------

test('books published before the floor are dropped and counted, not plotted', () => {
  const spread = publicationBuckets([
    book({ publishedYear: -500 }),
    book({ publishedYear: 180 }),
    book({ publishedYear: 1890 }),
    book({ publishedYear: 1995 }),
    book({ publishedYear: 1999 }),
    book({ publishedYear: 2003 }),
    // No year at all: neither plotted nor counted as excluded.
    book({ publishedYear: null }),
  ]);
  assert.deepEqual(
    spread.buckets.map((b) => [b.label, b.count]),
    [
      ['1990s', 2],
      ['2000s', 1],
    ],
  );
  assert.equal(spread.excluded, 3);
});

test('BC publication years format readably', () => {
  assert.equal(formatYear(-500), '500 BC');
  assert.equal(formatYear(2022), '2022');
  assert.equal(formatYear(null), 'Unknown');
});
