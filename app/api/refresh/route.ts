import { timingSafeEqual } from 'node:crypto';

/**
 * Triggers the sync workflow on demand, so the daily cron can stay daily.
 *
 * The fetching itself stays in GitHub Actions — this only kicks it off, so the
 * request returns immediately and the repo stays the single source of truth.
 *
 * Needs three environment variables on Vercel:
 *   REFRESH_SECRET         any long random string; the page passes it as ?key=
 *   GITHUB_DISPATCH_TOKEN  fine-grained PAT, Actions: read & write, this repo only
 *   GITHUB_REPOSITORY      "owner/repo"
 */
export const dynamic = 'force-dynamic';

const WORKFLOW = 'sync.yml';

function secretsMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.REFRESH_SECRET;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!secret || !token || !repo) {
    return Response.json(
      { error: 'Refreshing on demand is not configured for this site yet.' },
      { status: 503 },
    );
  }

  const key = new URL(request.url).searchParams.get('key') ?? '';
  if (!secretsMatch(key, secret)) {
    return Response.json({ error: 'Not allowed.' }, { status: 401 });
  }

  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  );

  if (!response.ok) {
    // Don't echo GitHub's response to the browser; log it and say something useful.
    console.error('workflow dispatch failed', response.status, await response.text());
    return Response.json(
      { error: 'Could not start the sync. Try again in a minute.' },
      { status: 502 },
    );
  }

  return Response.json({ started: true });
}
