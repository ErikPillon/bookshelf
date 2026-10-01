import { XMLParser } from 'fast-xml-parser';
import type { UpdateEvent, UpdateEventType } from '../../lib/types';
import { GOODREADS_USER_ID } from '../../lib/config';
import { parseFeedTimestamp } from './dates';

const USER_AGENT = 'bookshelf-sync/0.1 (+personal reading stats)';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
});

/** The guid prefix is the only reliable event discriminator. */
function classify(guid: string, title: string): UpdateEventType {
  if (guid.startsWith('UserStatus')) return 'progress';
  if (guid.startsWith('ReadStatus')) {
    if (/\bfinished reading\b/i.test(title)) return 'finished';
    if (/\bstarted reading\b/i.test(title)) return 'started';
    return 'shelved';
  }
  if (guid.startsWith('Review')) return 'review';
  return 'other';
}

interface RawItem {
  guid?: string | { '#text'?: string };
  pubDate?: string;
  title?: string;
  description?: string;
}

function textOf(v: RawItem['guid']): string {
  if (typeof v === 'string') return v;
  return v?.['#text'] ?? '';
}

/**
 * The updates feed is a rolling window of roughly the ten most recent events.
 * It cannot be backfilled, so every sync appends whatever it finds and the
 * caller merges by guid. Page-level reading velocity depends entirely on having
 * started collecting these early.
 */
export async function fetchUpdates(): Promise<UpdateEvent[]> {
  const url = `https://www.goodreads.com/user/updates_rss/${GOODREADS_USER_ID}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`updates feed returned ${res.status}`);

  const doc = parser.parse(await res.text());
  const raw = doc?.rss?.channel?.item;
  const items: RawItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const events: UpdateEvent[] = [];

  for (const item of items) {
    const guid = textOf(item.guid).trim();
    const title = String(item.title ?? '').replace(/\s+/g, ' ').trim();
    const at = parseFeedTimestamp(item.pubDate);
    if (!guid || !at) continue;

    // "Erik is on page 46 of 293 of Mastering 'Metrics"
    const prog = /\bon page (\d+) of (\d+)\b/.exec(title);
    // Book id only appears in the description's href: /book/show/23986891-slug
    const bookId = /\/book\/show\/(\d+)/.exec(String(item.description ?? ''))?.[1] ?? null;
    const titleMatch = /\bof (?:\d+) of (.+)$/.exec(title);

    events.push({
      guid,
      type: classify(guid, title),
      at,
      bookId,
      bookTitle: titleMatch?.[1]?.trim() ?? null,
      page: prog ? Number.parseInt(prog[1], 10) : null,
      of: prog ? Number.parseInt(prog[2], 10) : null,
      raw: title,
    });
  }

  return events;
}
