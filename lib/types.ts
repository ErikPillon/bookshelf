/** Normalized data model. Everything downstream reads these shapes, never raw Goodreads output. */

export type Shelf = 'read' | 'currently-reading' | 'to-read' | 'did-not-finish';

export const SHELVES: Shelf[] = ['read', 'currently-reading', 'to-read', 'did-not-finish'];

export interface Progress {
  page: number;
  of: number;
  /**
   * ISO timestamp of the status update this came from, or null when the source
   * did not carry a parseable one. Never substituted with the sync time.
   */
  at: string | null;
}

export interface Book {
  /** Goodreads review id — stable per book-per-user. Primary key. */
  reviewId: string;
  bookId: string;
  title: string;
  author: string;
  isbn: string | null;
  pages: number | null;
  /** Original publication year where known, else edition year. */
  publishedYear: number | null;
  /** 1-5, or null when unrated (Goodreads reports 0). */
  myRating: number | null;
  /** Goodreads community average. */
  avgRating: number | null;
  /**
   * YYYY-MM-DD of the MOST RECENT read. Null for a handful of older entries.
   * Goodreads' own challenge counts the most recent read, which is why this is
   * the field the year charts bucket on.
   */
  dateRead: string | null;
  /**
   * An earlier read of the same book, where the sources disagree because
   * readCount > 1. Neither source exposes the full set of read dates.
   */
  previousReadDate: string | null;
  /** YYYY-MM-DD. Goodreads' "date added" is really the last shelf change. */
  dateAdded: string | null;
  /** YYYY-MM-DD. When the book first entered any shelf. */
  dateFirstAdded: string | null;
  /** Custom shelves / tags, exclusive shelf removed. */
  tags: string[];
  review: string | null;
  coverUrl: string | null;
  shelf: Shelf;
  readCount: number;
  progress: Progress | null;
  /** Set when a book disappears from the feed. We never delete. */
  removedAt: string | null;
}

export type UpdateEventType =
  | 'progress'
  | 'started'
  | 'finished'
  | 'review'
  | 'shelved'
  | 'other';

/**
 * One event from the user updates feed. That feed is a rolling window of only
 * the ~10 most recent events, so these accumulate append-only across syncs and
 * can never be backfilled.
 */
export interface UpdateEvent {
  /** e.g. "UserStatus1342667842" — the prefix is the event type. */
  guid: string;
  type: UpdateEventType;
  at: string;
  bookId: string | null;
  bookTitle: string | null;
  page: number | null;
  of: number | null;
  /** Original title text, kept so events can be re-parsed as the parser improves. */
  raw: string;
}

export interface Library {
  books: Book[];
}

export interface Meta {
  syncedAt: string;
  profileUrl: string;
  counts: Record<Shelf, number> & { total: number };
  challenge: {
    year: number;
    /** From config — Goodreads does not expose this without JS. */
    goal: number | null;
    /** Derived: books with dateRead in `year`. */
    completed: number;
  };
  sources: {
    rss: boolean;
    csvSeed: boolean;
    profileHtml: boolean;
    updates: boolean;
  };
  /** Non-fatal problems worth surfacing in the footer. */
  warnings: string[];
}
