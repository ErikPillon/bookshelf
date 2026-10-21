# Bookshelf

A personal reading-stats site built from Goodreads data. Reading challenge
progress, history, taste, and the full shelf — static, fast, and updated daily.

Source profile: https://www.goodreads.com/user/show/91605767-erik-pillon

## How it works

```
                    ┌──── cron: daily ─────┐
                    │                      ▼
Goodreads RSS ──> GitHub Action ──> commit data/*.json ──> Vercel build ──> static page
                    ▲
                    └──── workflow_dispatch ◄── "Refresh from Goodreads" button
```

Nothing is fetched at request time. A scheduled GitHub Action reads the feeds,
normalizes them, and commits JSON to `data/`; the commit triggers a Vercel
build. The page cannot break when Goodreads is slow or blocking — at worst it
goes stale, and the footer says when it was last synced.

The commit history doubles as an append-only archive of the reading history.

## Data sources

| Source | Gives us |
|---|---|
| `review/list_rss/<id>?shelf=%23ALL%23` | All four shelves in one paginated feed: ratings, dates, tags, covers, community averages |
| `data/seed/goodreads_library_export.csv` | The authoritative baseline: exclusive shelf, original publication year, read counts |
| `user/updates_rss/<id>` | Page-progress events. A rolling ~10-event window, so it accumulates and cannot be backfilled |
| Profile HTML | Current page progress for the few books the widget shows. Optional, isolated, expected to break eventually |

Notes worth knowing before changing the ingest:

- The Goodreads **API has been dead since Dec 2020**. RSS is the only sanctioned
  machine-readable route.
- `num_pages` is nested inside `<book id="...">`, not a top-level feed field.
- The **reading-challenge goal is not scrapeable** — that widget is rendered
  client-side. The goal lives in `lib/config.ts`; progress is derived from read
  dates, which reproduces the number Goodreads itself shows.
- **Re-reads** make RSS and the CSV disagree on read date by design: RSS reports
  the latest read, the CSV an earlier one. Both are kept; charts bucket on the
  most recent, which is what the challenge counts.
- **The CSV export is a frozen snapshot and must never win on a field that
  changes.** It may only fill a gap RSS left empty, or supply `publishedYear`
  and `readCount`, which RSS has no equivalent for. Letting it win on `shelf`
  silently reverted every shelf move made after the export date. A book present
  only in the export has been deleted from Goodreads and is archived as removed
  rather than resurrected. `scripts/lib/merge.test.ts` pins all of this down.

## Commands

```bash
npm run dev       # local site
npm run sync      # fetch from Goodreads and write data/
npm run sync -- --dry   # fetch and report, write nothing
npm test          # stats unit tests
npm run build     # production build
```

`npm run sync` reads `GOODREADS_RSS_KEY` from `.env.local` (gitignored). The key
is only needed for the `#ALL#` shelf; the per-shelf feeds are public.

## Deploying

### GitHub

Add one repository secret:

- `GOODREADS_RSS_KEY` — the `key=` value from your Goodreads RSS link

The sync workflow runs daily and on demand. Note that GitHub **disables
scheduled workflows after 60 days of repository inactivity**, and the bot's own
commits do not reliably reset that timer — if syncs stop, re-enable the workflow
in the Actions tab.

### Vercel

Import the repo. No build configuration is needed. For the in-app refresh
button, set three environment variables:

| Variable | Value |
|---|---|
| `REFRESH_SECRET` | Any long random string |
| `GITHUB_DISPATCH_TOKEN` | Fine-grained PAT, *Actions: read & write*, this repo only |
| `GITHUB_REPOSITORY` | `owner/repo` |

Then visit the site once with `?key=<REFRESH_SECRET>`. The key is remembered in
that browser and dropped from the address bar, so from then on the button is
simply there in the footer — no query string needed, and the secret does not sit
in your history or get copied into a shared link.

Without these variables the site works fine and the daily sync still runs; the
button just reports which ones are missing when pressed.

Vercel Hobby is non-commercial use only, which a personal reading page satisfies.

## Layout

```
app/              page, layout, /api/refresh
components/       UI — charts are hand-rolled CSS/SVG, no chart library
lib/
  types.ts        the normalized data model
  config.ts       everything user-specific: profile, challenge goals, thresholds
  stats.ts        derived statistics — pure functions, "now" always injected
  stats.test.ts   unit tests for the pace, streak and bucketing maths
scripts/
  sync.ts         the ingest orchestrator
  lib/            feed, CSV, updates and profile parsers
data/             committed snapshot — the site builds from this
```
