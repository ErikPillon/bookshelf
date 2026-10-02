'use client';

import { useMemo, useState } from 'react';
import type { Book } from '@/lib/types';
import { formatYear } from '@/lib/stats';
import { nf } from './ui';

type SortKey = 'dateRead' | 'title' | 'author' | 'myRating' | 'pages';

const PAGE_SIZE = 25;

const SHELF_LABELS: Record<Book['shelf'], string> = {
  read: 'Read',
  'currently-reading': 'Reading',
  'to-read': 'Want to read',
  'did-not-finish': 'Did not finish',
};

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'title', label: 'Title', align: 'left' },
  { key: 'author', label: 'Author', align: 'left' },
  { key: 'myRating', label: 'Rating', align: 'right' },
  { key: 'pages', label: 'Pages', align: 'right' },
  { key: 'dateRead', label: 'Finished', align: 'right' },
];

export function BookTable({ books }: { books: Book[] }) {
  const [query, setQuery] = useState('');
  const [shelf, setShelf] = useState<Book['shelf'] | 'all'>('read');
  const [sort, setSort] = useState<SortKey>('dateRead');
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const rows = books.filter((book) => {
      if (book.removedAt) return false;
      if (shelf !== 'all' && book.shelf !== shelf) return false;
      if (!needle) return true;
      return (
        book.title.toLowerCase().includes(needle) ||
        book.author.toLowerCase().includes(needle)
      );
    });

    const direction = ascending ? 1 : -1;
    return rows.sort((a, b) => {
      const [x, y] = [a[sort], b[sort]];
      // Unknown values sort last whichever way the column is pointing.
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * direction;
      return String(x).localeCompare(String(y)) * direction;
    });
  }, [books, query, shelf, sort, ascending]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (key === sort) setAscending((v) => !v);
    else {
      setSort(key);
      setAscending(key === 'title' || key === 'author');
    }
    setPage(0);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex-1 basis-56">
          <span className="sr-only">Search by title or author</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search title or author"
            className="w-full rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
          />
        </label>

        <label>
          <span className="sr-only">Shelf</span>
          <select
            value={shelf}
            onChange={(e) => {
              setShelf(e.target.value as Book['shelf'] | 'all');
              setPage(0);
            }}
            className="rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink"
          >
            <option value="read">Read</option>
            <option value="currently-reading">Reading</option>
            <option value="to-read">Want to read</option>
            <option value="did-not-finish">Did not finish</option>
            <option value="all">Every shelf</option>
          </select>
        </label>
      </div>

      <p className="mb-3 text-xs text-ink-muted" aria-live="polite">
        {nf.format(filtered.length)} {filtered.length === 1 ? 'book' : 'books'}
        {query && ` matching “${query}”`}
      </p>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">
          Nothing matches that search.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      sort === column.key ? (ascending ? 'ascending' : 'descending') : 'none'
                    }
                    className={`border-b border-line pb-2 ${
                      column.align === 'left' ? 'text-left' : 'pl-4 text-right'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="cursor-pointer text-xs font-medium text-ink-muted hover:text-ink"
                    >
                      {column.label}
                      {sort === column.key && (ascending ? ' ↑' : ' ↓')}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((book) => (
                <tr key={book.reviewId} className="align-top">
                  <td className="border-b border-line py-2.5 pr-3 text-ink">
                    <span className="line-clamp-2">{book.title}</span>
                    {book.readCount > 1 && (
                      <span className="ml-1.5 text-xs text-ink-muted">
                        read {book.readCount}×
                      </span>
                    )}
                  </td>
                  <td className="border-b border-line py-2.5 pr-3 text-ink-secondary">
                    <span className="line-clamp-2">{book.author}</span>
                  </td>
                  <td className="tnum border-b border-line py-2.5 pl-4 text-right text-ink-secondary">
                    {book.myRating === null ? '—' : `${book.myRating}★`}
                  </td>
                  <td className="tnum border-b border-line py-2.5 pl-4 text-right text-ink-secondary">
                    {book.pages === null ? '—' : nf.format(book.pages)}
                  </td>
                  <td className="tnum border-b border-line py-2.5 pl-4 text-right whitespace-nowrap text-ink-secondary">
                    {book.dateRead ?? (shelf === 'all' ? SHELF_LABELS[book.shelf] : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
            className="min-h-11 cursor-pointer rounded-lg border border-line px-3 text-sm text-ink disabled:cursor-default disabled:opacity-40"
          >
            Previous
          </button>
          <span className="tnum text-xs text-ink-muted">
            Page {current + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(current + 1)}
            disabled={current >= pageCount - 1}
            className="min-h-11 cursor-pointer rounded-lg border border-line px-3 text-sm text-ink disabled:cursor-default disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
