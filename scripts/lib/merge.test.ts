import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Book } from '../../lib/types';
import { fromCsvOnly, mergeBook, type CsvBook } from './merge';

function rssBook(overrides: Partial<Book> = {}): Book {
  return {
    reviewId: 'r1',
    bookId: 'b1',
    title: 'A Book',
    author: 'An Author',
    isbn: null,
    pages: 300,
    publishedYear: 2015,
    myRating: 4,
    avgRating: 4.2,
    dateRead: null,
    previousReadDate: null,
    dateAdded: '2026-01-01',
    dateFirstAdded: '2025-01-01',
    tags: [],
    review: null,
    coverUrl: 'https://example.test/cover.jpg',
    shelf: 'currently-reading',
    readCount: 1,
    progress: null,
    removedAt: null,
    ...overrides,
  };
}

// --- the regression that prompted this module ------------------------------

test('a book finished since the export is filed as read, not reverted', () => {
  // The export is frozen on the day it was taken. This book has since been
  // finished, so RSS reports it on the read shelf with a date. Letting the
  // export win here filed it back under currently-reading, and because every
  // statistic filters on shelf === 'read', the book disappeared from the site.
  const merged = mergeBook(
    rssBook({ shelf: 'read', dateRead: '2026-10-10' }),
    { bookId: 'b1', shelf: 'currently-reading', dateRead: null },
  );

  assert.equal(merged.shelf, 'read');
  assert.equal(merged.dateRead, '2026-10-10');
});

test('every other live shelf move also follows RSS', () => {
  const moves: [Book['shelf'], Book['shelf']][] = [
    ['read', 'to-read'],
    ['did-not-finish', 'currently-reading'],
    ['currently-reading', 'to-read'],
    ['to-read', 'read'],
  ];

  for (const [live, stale] of moves) {
    const merged = mergeBook(rssBook({ shelf: live }), { bookId: 'b1', shelf: stale });
    assert.equal(merged.shelf, live, `expected ${live}, export said ${stale}`);
  }
});

test('tags follow RSS, including when the last one is removed', () => {
  const merged = mergeBook(rssBook({ tags: [] }), { bookId: 'b1', tags: ['science'] });
  assert.deepEqual(merged.tags, []);

  const retagged = mergeBook(rssBook({ tags: ['history'] }), {
    bookId: 'b1',
    tags: ['science'],
  });
  assert.deepEqual(retagged.tags, ['history']);
});

// --- gap filling ------------------------------------------------------------

test('the export fills gaps RSS leaves empty', () => {
  const merged = mergeBook(
    rssBook({ pages: null, isbn: null, dateRead: null, myRating: null, review: null }),
    {
      bookId: 'b1',
      pages: 412,
      isbn: '1982172002',
      dateRead: '2019-03-02',
      myRating: 5,
      review: 'Good.',
    },
  );

  assert.equal(merged.pages, 412);
  assert.equal(merged.isbn, '1982172002');
  assert.equal(merged.dateRead, '2019-03-02');
  assert.equal(merged.myRating, 5);
  assert.equal(merged.review, 'Good.');
});

test('the export never overwrites a value RSS actually has', () => {
  const merged = mergeBook(
    rssBook({ pages: 300, myRating: 4, dateRead: '2026-05-05' }),
    { bookId: 'b1', pages: 999, myRating: 1, dateRead: '2020-01-01' },
  );

  assert.equal(merged.pages, 300);
  assert.equal(merged.myRating, 4);
  assert.equal(merged.dateRead, '2026-05-05');
});

// --- the two fields the export owns ----------------------------------------

test('publication year prefers the export, which has the original not the edition', () => {
  const merged = mergeBook(rssBook({ publishedYear: 2015 }), {
    bookId: 'b1',
    publishedYear: 1949,
  });
  assert.equal(merged.publishedYear, 1949);
});

test('read count comes from the export, since RSS does not report it', () => {
  const merged = mergeBook(rssBook(), { bookId: 'b1', readCount: 3 });
  assert.equal(merged.readCount, 3);
});

// --- re-reads ---------------------------------------------------------------

test('a re-read keeps both dates, latest as the read date', () => {
  const merged = mergeBook(rssBook({ dateRead: '2026-09-30' }), {
    bookId: 'b1',
    dateRead: '2024-12-23',
    readCount: 2,
  });
  assert.equal(merged.dateRead, '2026-09-30');
  assert.equal(merged.previousReadDate, '2024-12-23');
});

test('matching dates are not recorded as a previous read', () => {
  const merged = mergeBook(rssBook({ dateRead: '2026-09-30' }), {
    bookId: 'b1',
    dateRead: '2026-09-30',
  });
  assert.equal(merged.previousReadDate, null);
});

// --- no counterpart ---------------------------------------------------------

test('a book absent from the export passes through untouched', () => {
  const rss = rssBook({ shelf: 'read', dateRead: '2026-10-10' });
  assert.deepEqual(mergeBook(rss, undefined), rss);
});

test('an export row with no RSS counterpart still becomes a book', () => {
  const csv: CsvBook = {
    bookId: 'b9',
    title: 'Only In The Export',
    author: 'Someone',
    shelf: 'read',
    dateRead: '2013-06-01',
    pages: 200,
  };
  const book = fromCsvOnly(csv, '2026-10-21');

  assert.equal(book.bookId, 'b9');
  assert.equal(book.reviewId, 'csv-b9');
  assert.equal(book.shelf, 'read');
  assert.equal(book.dateRead, '2013-06-01');
  assert.equal(book.coverUrl, null);
});

test('an export-only book is archived as removed, not resurrected', () => {
  // RSS returns the whole library, so a book it no longer lists has been
  // deleted from Goodreads. Keeping it live meant the frozen export kept
  // putting deleted books back on the shelves.
  const book = fromCsvOnly({ bookId: 'b9', shelf: 'to-read' }, '2026-10-21');
  assert.equal(book.removedAt, '2026-10-21');
});
