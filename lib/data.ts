import fs from 'node:fs';
import path from 'node:path';
import type { Library, Meta } from './types';

/**
 * Reads the committed snapshot. Build-time only — the page never fetches
 * Goodreads at request time, so it cannot break when Goodreads is down.
 */
function read<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', file), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export const loadLibrary = (): Library => read<Library>('library.json', { books: [] });

export const loadMeta = (): Meta | null => read<Meta | null>('meta.json', null);
