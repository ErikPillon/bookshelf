import * as cheerio from 'cheerio';
import type { Progress } from '../../lib/types';
import { GOODREADS_PROFILE_URL } from '../../lib/config';
import { parseFeedTimestamp } from './dates';

const USER_AGENT = 'bookshelf-sync/0.1 (+personal reading stats)';

/**
 * Scrapes current page progress out of the profile's currently-reading widget.
 *
 * Supplementary only, for two reasons: the widget shows just a handful of the
 * currently-reading books, and this is the one part of the sync reading HTML
 * rather than a feed. It is expected to break eventually; callers must treat a
 * rejection as non-fatal.
 *
 * The reading-challenge widget is NOT scrapeable here — it is rendered
 * client-side, so the goal comes from config and progress is derived from data.
 */
export async function fetchProfileProgress(): Promise<Map<string, Progress>> {
  const out = new Map<string, Progress>();

  const res = await fetch(GOODREADS_PROFILE_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`profile returned ${res.status}`);

  const $ = cheerio.load(await res.text());

  // The book id, current page, and status timestamp are all carried in the
  // anchor's onclick: clickPageOfBook(23986891, 46, {viewLink: '...Sep 30, 2026...'})
  $('a[onclick*="clickPageOfBook"]').each((_, el) => {
    const onclick = $(el).attr('onclick') ?? '';
    const call = /clickPageOfBook\((\d+),\s*(\d+)/.exec(onclick);
    if (!call) return;

    // The link text carries the total: "(page 46 of 293)"
    const total = /page\s+\d+\s+of\s+(\d+)/.exec($(el).text());
    if (!total) return;

    const [bookId, page] = [call[1], Number.parseInt(call[2], 10)];
    const of = Number.parseInt(total[1], 10);
    if (!Number.isFinite(page) || !Number.isFinite(of) || of <= 0) return;

    const when = />([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}[^<]*)</.exec(onclick);
    out.set(bookId, { page, of, at: parseFeedTimestamp(when?.[1]) });
  });

  return out;
}
