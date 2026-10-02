import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvDate, parseFeedDate, parseFeedTimestamp } from './dates';

test('feed dates read the calendar fields, ignoring the timezone', () => {
  // Converting this through UTC would move it to 1 Oct — and so move the book
  // into the wrong month, and at a year boundary the wrong year.
  assert.equal(parseFeedDate('Wed, 30 Sep 2026 00:27:49 -0700'), '2026-09-30');
  assert.equal(parseFeedDate('Sat, 1 Feb 2020 23:00:00 +0100'), '2020-02-01');
});

test('feed dates pad single-digit days', () => {
  assert.equal(parseFeedDate('Fri, 3 Apr 2024 04:24:26 -0700'), '2024-04-03');
});

test('missing or unparseable dates come back as null', () => {
  assert.equal(parseFeedDate(''), null);
  assert.equal(parseFeedDate(null), null);
  assert.equal(parseFeedDate('not a date'), null);
  assert.equal(parseFeedDate('Wed, 30 Xxx 2026 00:00:00 +0000'), null);
});

test('CSV dates convert from the export format', () => {
  assert.equal(parseCsvDate('2024/12/23'), '2024-12-23');
  assert.equal(parseCsvDate('2021/1/5'), '2021-01-05');
  assert.equal(parseCsvDate(''), null);
});

test('profile timestamps parse without a space before the meridiem', () => {
  // Goodreads writes "03:03PM"; Date() cannot parse that unaided, and the
  // failure used to be masked by a "now" fallback that rewrote the value on
  // every sync.
  const parsed = parseFeedTimestamp('Sep 30, 2026 03:03PM');
  assert.ok(parsed, 'expected a timestamp, got null');
  assert.match(parsed, /^2026-09-30T/);
});

test('an unparseable timestamp returns null rather than the current time', () => {
  assert.equal(parseFeedTimestamp('whenever'), null);
  assert.equal(parseFeedTimestamp(undefined), null);
});
