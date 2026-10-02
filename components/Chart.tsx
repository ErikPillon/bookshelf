/**
 * Vertical bar chart. One idea per chart, one series, no second axis.
 *
 * Hand-rolled SVG rather than a chart library: it keeps the mark specs exact
 * (4px rounded data-ends anchored to the baseline, 2px gap between bars,
 * recessive grid) and keeps the page a server component with no JS bundle.
 */
export interface BarDatum {
  label: string;
  /** Short form for narrow screens, e.g. "J" for January. */
  shortLabel?: string;
  value: number;
  /** Extra line in the tooltip, e.g. a page count. */
  detail?: string;
}

interface ChartProps {
  data: BarDatum[];
  unit: string;
  /** Said in words, not left to the axis ticks. */
  range: string;
  emptyMessage?: string;
}

const H = 180;

/** Nice round axis maximum, so ticks are readable numbers. */
function axisMax(values: number[]): number {
  const peak = Math.max(1, ...values);
  const step = peak <= 5 ? 1 : peak <= 20 ? 5 : peak <= 60 ? 10 : 20;
  return Math.ceil(peak / step) * step;
}

export function Chart({ data, unit, range, emptyMessage = 'Nothing to show yet.' }: ChartProps) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <p className="py-10 text-center text-sm text-ink-muted">{emptyMessage}</p>;
  }

  const max = axisMax(data.map((d) => d.value));
  const ticks = [0, max / 2, max];
  const peak = Math.max(...data.map((d) => d.value));

  // Laid out with CSS rather than SVG: a viewBox scaled to the container width
  // stretches the 4px data-end radius and the 2px gap along with it, so the
  // marks stop matching their spec at anything but one exact width.
  return (
    <figure className="m-0">
      <div className="flex gap-2">
        <div
          className="relative w-6 shrink-0"
          style={{ height: H }}
          aria-hidden
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="tnum absolute right-0 -translate-y-1/2 text-[11px] text-ink-muted"
              style={{ top: H - (t / max) * H }}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: H }}>
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t"
                style={{
                  top: H - (t / max) * H,
                  borderColor: t === 0 ? 'var(--baseline)' : 'var(--gridline)',
                }}
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-0.5">
              {data.map((d) => (
                <div
                  key={d.label}
                  className="group relative flex h-full flex-1 items-end justify-center"
                  title={`${d.label}: ${d.value} ${unit}${d.detail ? ` · ${d.detail}` : ''}`}
                >
                  {d.value > 0 && (
                    <div
                      className="w-full max-w-11 rounded-t bg-series-1 transition-opacity group-hover:opacity-80"
                      style={{ height: `${(d.value / max) * 100}%` }}
                    />
                  )}

                  {/* Values on hover rather than a number printed on every bar. */}
                  <span
                    className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-1 text-[11px] whitespace-nowrap text-ink opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                    style={{ bottom: `calc(${(d.value / max) * 100}% + 6px)`, top: 'auto' }}
                  >
                    <span className="tnum font-medium">{d.value}</span> {unit}
                    {d.detail && <span className="text-ink-muted"> · {d.detail}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-0.5" aria-hidden>
            {data.map((d) => (
              <span
                key={d.label}
                className="min-w-0 flex-1 truncate pt-1.5 text-center text-[11px] text-ink-muted"
              >
                <span className="hidden sm:inline">{d.label}</span>
                <span className="sm:hidden">{d.shortLabel ?? d.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <figcaption className="mt-3 text-xs text-ink-muted">
        {unit} per {range} · peak {peak}
      </figcaption>
    </figure>
  );
}

/**
 * Horizontal bars for long labels (authors, shelves), where a vertical axis
 * would force the text to rotate.
 */
export function RankedBars({
  data,
  unit,
}: {
  data: { label: string; value: number; detail?: string }[];
  unit: string;
}) {
  if (data.length === 0) {
    return <p className="py-6 text-sm text-ink-muted">Nothing tagged yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.value));

  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-ink">{d.label}</span>
              <span className="tnum shrink-0 text-xs text-ink-muted">
                {d.detail ?? `${d.value} ${unit}`}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-wash">
              <div
                className="h-1.5 rounded-full bg-series-1"
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
