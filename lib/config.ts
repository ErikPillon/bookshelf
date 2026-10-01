/** Everything user-specific lives here. */

export const GOODREADS_USER_ID = '91605767';
export const GOODREADS_PROFILE_URL =
  'https://www.goodreads.com/user/show/91605767-erik-pillon';

/**
 * Reading challenge goals by year. Goodreads renders the challenge widget
 * client-side, so the goal cannot be scraped — but it is one integer that
 * changes once a year. Progress is derived from the data, not scraped.
 */
export const CHALLENGE_GOALS: Record<number, number> = {
  2026: 52,
};

/** A currently-reading book with no activity for this long is shown as parked. */
export const PARKED_AFTER_DAYS = 60;

/** Sync aborts rather than committing if the read shelf shrinks by more than this. */
export const SANITY_MAX_SHRINK_RATIO = 0.1;

/** Politeness delay between Goodreads requests, ms. */
export const REQUEST_DELAY_MS = 1000;

export const SITE = {
  title: 'Bookshelf',
  description: 'Reading stats, challenge progress, and a complete reading history.',
  owner: 'Erik Pillon',
};
