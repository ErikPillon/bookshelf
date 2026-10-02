# Bookshelf — a personal Goodreads clone

A static reading-stats page for one user, built from Goodreads RSS feeds, deployed on Vercel (Hobby).

**Source profile:** https://www.goodreads.com/user/show/91605767-erik-pillon (public)
**Plan written:** 2026-10-02 · **Built:** 2026-10-02

> **Status: phases 0–5 shipped.** See `README.md` for how the thing actually works
> and how to deploy it. This document is kept as the record of the decisions and
> the reasoning behind them; where the build diverged from the plan, the sections
> below say so inline.

---

## 0. Verified facts this plan rests on

Checked directly against the live profile and feeds before writing this:

| Fact | Value |
|---|---|
| Profile visibility | Public — no RSS `key` param needed |
| Goodreads API | Dead since Dec 2020. RSS is the only sanctioned machine-readable route. |
| Shelf counts | 229 read · 17 currently-reading · 422 to-read · 3 did-not-finish |
| Ratings | 222 ratings, 3.88 average · 14 written reviews |
| 2026 challenge | 20 of 52 books |
| Shelf RSS pagination | `?per_page=100&page=N` works. **Changed in build:** one `shelf=%23ALL%23` feed with the RSS key covers all four shelves in 7 pages, which beat four separate paginated feeds |
| Updates RSS | `/user/updates_rss/91605767` exists and carries page-progress events |

### What the shelf feeds give us

Per `<item>`: `guid`, `pubDate`, `book_id`, `title`, `author_name`, `isbn`, `num_pages`,
`book_published`, `user_rating`, `user_read_at`, `user_date_added`, `user_date_created`,
`user_shelves`, `user_review`, `average_rating`, `book_description`, and cover URLs in four sizes.

Feed endpoints (one request per shelf, paginated):

```
https://www.goodreads.com/review/list_rss/91605767?shelf=read&per_page=100&page=N
https://www.goodreads.com/review/list_rss/91605767?shelf=currently-reading
https://www.goodreads.com/review/list_rss/91605767?shelf=to-read&per_page=100&page=N
https://www.goodreads.com/review/list_rss/91605767?shelf=did-not-finish
```

### What they do NOT give us

1. **Reading-challenge goal and count** (the `20 of 52`).
2. **Per-book progress** (`page X of Y`) for currently-reading.

**Changed in build.** The challenge widget turned out not to be in the server HTML
at all — it is rendered client-side, so it cannot be scraped with a plain fetch.
That forced a better design: the *goal* lives in `lib/config.ts` (one integer a
year) and the *count* is derived from read dates. Verified to reproduce Goodreads'
own number exactly (20). No challenge scraping at all.

Progress is still partly scraped, from an `onclick="clickPageOfBook(bookId, page, …)"`
attribute, and remains optional enrichment — the page renders correctly without it.

---

## 1. Architecture: build-time data, not request-time scraping

```
                    ┌──── cron: daily ─────┐
                    │                      ▼
Goodreads RSS ──> GitHub Action ──> commit data/*.json ──> Vercel build ──> static page
                    ▲
                    └──── workflow_dispatch ◄── "Refresh now" button in the app
```

A scheduled GitHub Action fetches the feeds, normalizes them, and commits JSON into the repo.
The commit triggers a Vercel deploy. The page is fully static with **zero runtime dependency on
Goodreads**.

### Why this shape

- **Free at every layer.** Public-repo Actions minutes are unlimited; Hobby build minutes (~6000/mo)
  are untouched by ~30 tiny builds a month.
- **Git history is a free append-only archive.** Every sync is a diff. You can answer "what changed
  this week" forever, and recover from any upstream deletion.
- **The page can't break when Goodreads is down or blocks us.** Worst case it goes stale.
- **One source of truth.** Stats read a local JSON file, so the whole site builds and runs offline.

### Alternatives considered

| Approach | Verdict |
|---|---|
| **GitHub Action → commit JSON → Vercel build** | **Chosen.** See above. |
| Vercel Cron → route handler → KV/Postgres | Hobby caps cron at once/day, 2 jobs max, and has no persistent filesystem. Now *viable* given the daily cadence, but it splits the data across repo + KV and loses the git archive. Keep as fallback only. |
| Fetch RSS at request time with ISR | 8+ sequential Goodreads requests per cold render, and we could never compute anything Goodreads doesn't currently expose. Rejected. |

---

## 2. Scheduling: daily cron + in-app manual trigger

**Cron: once per day.** One line of config (`CRON_SCHEDULE`) so changing it later is trivial.

**Recommendation: keep daily even though the button exists.** The reason to drop to weekly would be
cost, and there isn't any — a daily no-op sync that commits nothing also builds nothing. Daily means
the page is never more than a day stale even if you forget the button. Weekly is a one-line change
if you prefer it.

### The "Refresh now" button

Design, since this is what justifies the low cron frequency:

1. A route handler `POST /api/refresh` in the Next.js app.
2. It calls GitHub's `workflow_dispatch` API on the sync workflow, using a fine-grained PAT
   (`actions: write` on this repo only) stored as a Vercel env var. Never shipped to the client.
3. Protected by a shared secret — simplest workable version is a secret in the request that you keep
   in a bookmark, since this is a single-user personal site. No auth provider needed.
4. The Action runs, commits, Vercel redeploys. End to end ≈ 60–90s.
5. The button then polls `meta.syncedAt` and shows "synced just now" when the new build lands.

The dispatch call itself is a single ~200ms API request, comfortably inside Hobby's function
timeout. All the actual fetching stays in the Action, in one place.

### Scheduling caveats to design around

- Goodreads has **no webhooks**. "Auto-update when I update Goodreads" is polling, by necessity.
- GitHub **disables scheduled workflows after 60 days of repository inactivity**, and the bot's own
  commits do not reliably reset that timer. Mitigation: have the workflow touch the repo via the API,
  or accept a calendar reminder.
- **Skip the commit when nothing changed**, so no-op syncs don't burn build minutes or spam history.

---

## 3. Seed the history from a CSV export — *done*

Goodreads → *My Books* → *Import and export* → **Export Library**. Gives a CSV with `Date Read`,
`Date Added`, `My Rating`, `Number of Pages`, `Original Publication Year`, `Bookshelves`,
`Read Count`, `Exclusive Shelf`.

**Changed in build.** The gap turned out to be far smaller than feared — only 13 of
229 read books lack a date in the CSV, and 10 in RSS. So the export is not the
rescue it was billed as; it earns its place for three other things RSS has no
equivalent for: the clean `Exclusive Shelf` column, original publication years,
and read counts. RSS in turn has covers and community ratings the CSV lacks. The
two are complementary, so the merge is permanent rather than a one-time seed.

Commit it as `data/seed/goodreads_export.csv` so the backfill stays reproducible.

**Merge rule:** CSV wins on `dateRead` when RSS is empty; RSS wins on everything else (it's live).

---

## 4. Ingest pipeline

A single script, `scripts/sync.ts`:

1. Fetch the `#ALL#` feed, paginating `per_page=100&page=N` until a page returns < 100 items.
   ~1s delay between requests, descriptive User-Agent.
2. Fetch the profile HTML **once**, extracting only the two missing fields (challenge, progress).
   Isolated in its own module so it can fail without taking the sync down.
3. Parse, normalize, merge with the CSV seed.
4. Key on the **review `guid`** (stable per book-per-user); `book_id` secondary.
5. **Never delete.** A book that vanishes from a feed gets `removedAt` set. Append-only.
6. Write `data/library.json` and `data/meta.json`.
7. **Sanity gate:** exit non-zero if the book count drops >10% or the `read` shelf comes back empty.
   A Goodreads layout change or a Cloudflare block must fail loudly, not silently wipe the page.

Step 7 is the one people skip and regret.

### Normalized shape

```
Book: { reviewId, bookId, title, author, isbn, pages, publishedYear,
        myRating, avgRating, dateRead, dateAdded, shelves[], review,
        coverUrl, shelf: 'read'|'currently-reading'|'to-read'|'dnf',
        progress?: { page, of }, removedAt? }

Meta: { syncedAt, challenge?: { year, goal, completed }, counts, sourceWarnings[] }
```

Stats are **derived at build time by pure functions** over this array — never stored. Adding a chart
is then a function, not a migration.

---

## 5. The page

Sections in order of importance:

**Hero — this year.** Challenge ring, pace indicator, projected year-end, pages read YTD.
Pace formula: `linearTarget = goal * dayOfYear / daysInYear`, delta reported in books.
(As of the seed data: 20 of 52 against a linear target of ~39.)

**Currently reading.** Cover, progress bar from `progress`, days-since-started. With 17 open books,
include a "parked" treatment for ones with no recent activity.

**History.** Books-per-year and pages-per-year bars; month-by-month heatmap for the current year;
longest-streak-of-months counter.

**Taste.** Your rating histogram against Goodreads' average for the same books — the 3.88-vs-community
delta shows whether you rate generously or harshly. Top authors, top shelves/genres from your tags,
publication-year spread.

**Extremes.** Longest / shortest / oldest book, fastest finish.

**Full log.** Searchable, sortable table of all 671 — the archive view.

**Changed in build.** These became five tabs rather than one long page — `This year`,
`Reading now`, `History`, `Taste`, `All books` — so each view answers one question
and carries at most one chart. The active tab lives in the URL.

Design pass uses the `ui-ux` and `dataviz` skills so charts read as one system and work in both
light and dark.

---

## 6. Future: reading updates for finer-grained page tracking

*Nice-to-have, not first iteration — but with one action required in iteration 1.*

`https://www.goodreads.com/user/updates_rss/91605767` is a valid RSS feed carrying page-progress
events. Verified samples:

- `Erik is on page 46 of 293 of Mastering 'Metrics`
- `Erik started reading 'Mastering 'Metrics: The Path from Cause to Effect'`
- `Erik gave 5 stars to Chip War: ...`

Fields: `guid`, `pubDate`, `title`, `link`, `description` (with embedded HTML).

This is better than HTML scraping — it's a real feed, so progress tracking eventually needs **no
scraping at all**.

### Why this needs an iteration-1 decision

The updates feed is a **rolling window of recent activity only**. It cannot be backfilled. Every day
we don't capture it is a day of page-level history lost permanently.

**Shipped in Phase 1 as planned:** capture now, display later. The sync script appends raw parsed
update events to `data/updates.json`, deduped by `guid`. Nothing in the UI reads it yet. Cost is a
few lines and one extra HTTP request; the payoff is that when we build the feature, there's already
months of history behind it.

Once there's enough data: pages-read-per-day/week, actual reading velocity per book, session
patterns, and a far better "projected finish date" than shelf dates can give.

---

## 7. Stack

Next.js (App Router) + TypeScript, Tailwind, Recharts, statically generated. Covers mirrored into the
repo during sync so the page has no third-party runtime dependency; `next/image` with the Goodreads
CDN allowlisted as the interim option.

---

## 8. Milestones

| Phase | Deliverable |
|---|---|
| 0 | CSV export committed; repo + Vercel project wired up |
| 1 | `sync.ts` producing `library.json` locally, validated against the CSV. **Also starts appending `updates.json`.** |
| 2 | Stats layer as pure functions + unit tests on the tricky ones (pace, streaks, year bucketing) |
| 3 | Static page rendering real data |
| 4 | GitHub Action daily cron + auto-deploy; "last synced" footer |
| 5 | `/api/refresh` + in-app Refresh button |
| 6 | Polish: mobile, dark mode, OG image, cover mirroring |
| 7 | *Later:* reading-updates analytics on the accumulated `updates.json` |

Phases 0–6 are done. Phase 7 waits on `updates.json` accumulating enough history.

---

## 9. Risks

- **Goodreads blocks the fetch.** Datacenter IPs sometimes hit Cloudflare. The CSV seed means the
  page degrades to "stale but complete" rather than broken; fallback is running sync locally and
  pushing.
- **Profile HTML changes** break challenge/progress extraction. *Accepted risk — we revisit the
  project when it happens.* The only engineering commitment is that it fails loudly and in isolation,
  and that those two fields stay optional so the page keeps rendering.
- **Terms of service.** Lean on RSS for everything; keep HTML scraping to the two fields with no feed
  equivalent, at a low rate. Single-user non-commercial use also satisfies what Vercel Hobby requires.
- **Public repo exposes reading history** — already public on Goodreads, and since the feeds need no
  key there is no secret to leak. If the profile ever goes private, the RSS `key` becomes a GitHub
  secret.

---

## 10. Open questions — resolved

1. **Currently-reading triage.** Split. 14 of the 17 have had no activity for over
   60 days (several over 1,000), so showing them as equally "active" would be a
   lie. The live ones are listed; the parked ones collapse behind a disclosure.
2. **To-read.** No section of its own. It is reachable from the shelf filter in
   `All books` and nowhere else — this is a page about what has been read.
3. **Repo name.** Kept as `bookshelf`.

### Noted while building, left alone

*Principles: Life and Work* sits on currently-reading twice, as two separate
editions with their own review records (one at 0%, one at 54%). That is genuine
Goodreads data, not a duplicate introduced here, so the site shows both rather
than silently merging them. Worth cleaning up on Goodreads if it bothers you.
