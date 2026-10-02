const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/**
 * Goodreads RFC-2822 date -> YYYY-MM-DD, reading the calendar fields directly.
 * Deliberately ignores time and timezone: `new Date(...).toISOString()` shifts
 * "Wed, 30 Sep 2026 00:27:49 -0700" to 1 Oct, which silently moves books
 * between months and years in the charts.
 */
export function parseFeedDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})/.exec(raw.trim());
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
}

/** CSV export date ("2024/12/23") -> YYYY-MM-DD. */
export function parseCsvDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(raw.trim());
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/**
 * Full-precision timestamp, for events where ordering matters.
 *
 * Returns null rather than a fallback when parsing fails: a "now" fallback
 * silently rewrites the timestamp on every sync, which both churns the data
 * file and makes "days since last activity" permanently read as zero.
 */
export function parseFeedTimestamp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // The profile writes "Sep 30, 2026 03:03PM" — Date() needs a space before the
  // meridiem to parse it.
  const normalized = raw.trim().replace(/(\d)(AM|PM)$/i, '$1 $2');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
