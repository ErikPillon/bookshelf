import type { ChallengeStats } from '@/lib/stats';
import { nf, StatTile } from './ui';

/**
 * The one thing the page exists to answer: am I on track this year?
 * Everything else on the page is secondary to this block.
 */
export function ChallengeHero({
  challenge,
  pagesThisYear,
  streakMonths,
}: {
  challenge: ChallengeStats;
  pagesThisYear: number;
  streakMonths: number;
}) {
  const { goal, completed, percent, delta, projected, neededPerWeek, daysLeft, year } = challenge;

  // Status is never carried by colour alone — each verdict ships with a word.
  const verdict =
    goal === null
      ? null
      : delta !== null && delta >= 0
        ? { tone: 'good' as const, text: `${delta === 0 ? 'Exactly on' : `${delta} ahead of`} schedule` }
        : { tone: 'behind' as const, text: `${Math.abs(delta ?? 0)} books behind schedule` };

  return (
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-7">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-10">
        <div>
          <h1 className="m-0 text-sm font-medium tracking-wide text-ink-muted uppercase">
            {year} reading challenge
          </h1>

          <p className="m-0 mt-3 flex items-baseline gap-2">
            <span className="text-5xl leading-none font-semibold text-ink sm:text-6xl">
              {completed}
            </span>
            <span className="text-lg text-ink-secondary">of {goal ?? '—'} books</span>
          </p>

          {goal !== null && percent !== null && (
            <>
              <div
                className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-wash"
                role="progressbar"
                aria-valuenow={Math.round(percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${completed} of ${goal} books read`}
              >
                <div
                  className="h-full rounded-full bg-series-1"
                  style={{ width: `${Math.max(percent, 1)}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {verdict && (
                  <span
                    className="font-medium"
                    style={{
                      color: verdict.tone === 'good' ? 'var(--good-text)' : 'var(--critical)',
                    }}
                  >
                    {verdict.tone === 'good' ? '▲' : '▼'} {verdict.text}
                  </span>
                )}
                <span className="text-ink-secondary">
                  {Math.round(percent)}% done · {daysLeft} days left
                </span>
              </div>

              {neededPerWeek !== null && neededPerWeek > 0 && (
                <p className="mt-4 mb-0 text-sm text-ink-secondary">
                  Finishing needs{' '}
                  <strong className="font-semibold text-ink">
                    {neededPerWeek.toFixed(1)} books a week
                  </strong>{' '}
                  from here.
                </p>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 self-start lg:grid-cols-1">
          <StatTile label="Pages this year" value={nf.format(pagesThisYear)} />
          <StatTile
            label="On this pace"
            value={`${projected ?? '—'} books`}
            hint={goal !== null ? `${goal} needed` : undefined}
          />
          <StatTile
            label="Monthly streak"
            value={`${streakMonths} ${streakMonths === 1 ? 'month' : 'months'}`}
            hint="In a row with a book finished"
          />
        </div>
      </div>
    </section>
  );
}
