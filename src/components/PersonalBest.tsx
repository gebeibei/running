import { memo, useMemo } from 'react';
import type { Activity } from '../types';
import { useLocale } from '../hooks/useLocale';
import { parseMovingTime } from '../hooks/useActivities';

interface PersonalBestProps {
  activities: Activity[];
  onSelectActivity?: (a: Activity | null) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type EffortKey = '5k' | '10k' | 'half' | 'marathon';

interface DistanceTarget {
  key: EffortKey;
  meters: number;
  zh: string;
  en: string;
}

const DISTANCES: DistanceTarget[] = [
  { key: '5k', meters: 5000, zh: '5公里', en: '5K' },
  { key: '10k', meters: 10000, zh: '10公里', en: '10K' },
  { key: 'half', meters: 21097.5, zh: '半程马拉松', en: 'Half Marathon' },
  { key: 'marathon', meters: 42195, zh: '全程马拉松', en: 'Marathon' },
];

// Segments faster than 2:45/km are GPS noise, slower than 10:00/km is walking.
const MIN_PACE = 165;
const MAX_PACE = 600;

interface BestEntry {
  activity: Activity;
  seconds: number;
  fromSplit: boolean;
}

/**
 * Fastest effort for one target distance.
 *
 * The Python pipeline stores `best_efforts` per activity (fastest segment of
 * that run over the target distance, distance-calibrated against the recorded
 * distance), so a 5K tempo block inside a 12km run can win. Activities without
 * a usable track fall back to a whole-run equivalent time, which is only fair
 * when the run itself is at least as long as the target.
 */
function bestFor(runs: Activity[], target: DistanceTarget): BestEntry | null {
  let best: BestEntry | null = null;
  for (const activity of runs) {
    const split = activity.best_efforts?.[target.key];
    let entry: BestEntry;
    if (typeof split === 'number' && split > 0) {
      entry = { activity, seconds: split, fromSplit: true };
    } else {
      const total = parseMovingTime(activity.moving_time);
      if (total <= 0 || activity.distance < target.meters) continue;
      entry = {
        activity,
        seconds: (total * target.meters) / activity.distance,
        fromSplit: false,
      };
    }
    const pacePerKm = (entry.seconds / target.meters) * 1000;
    if (pacePerKm < MIN_PACE || pacePerKm > MAX_PACE) continue;
    if (!best || entry.seconds < best.seconds) best = entry;
  }
  return best;
}

export const PersonalBest = memo(function PersonalBest({
  activities,
  onSelectActivity,
}: PersonalBestProps) {
  const { locale } = useLocale();
  const isZh = locale === 'zh';

  const bests = useMemo(() => {
    const runs = activities.filter((a) => a.type === 'Run');
    return DISTANCES.map((target) => ({
      target,
      entry: bestFor(runs, target),
    }));
  }, [activities]);

  const hasBests = bests.some((b) => b.entry !== null);
  if (!hasBests) return null;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/5 hover:shadow-[var(--color-accent)]/5 hover:shadow-lg">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <svg
          className="h-4 w-4 text-[var(--color-accent)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
        {isZh ? '个人最佳' : 'Personal Best'}
      </h3>

      <div className="divide-y divide-[var(--color-border)]">
        {bests.map(({ target, entry }) => {
          const date = entry?.activity.start_date_local.slice(0, 10) ?? '';
          const km = entry ? (entry.activity.distance / 1000).toFixed(2) : '';
          const source = entry?.fromSplit
            ? `${isZh ? '分段' : 'split'} · ${km}km`
            : `${isZh ? '整次' : 'full run'} · ${km}km`;
          return (
            <button
              type="button"
              disabled={!entry || !onSelectActivity}
              key={target.key}
              title={
                entry ? `${entry.activity.name} · ${date} · ${source}` : ''
              }
              className={`flex w-full items-center justify-between gap-3 py-2 text-left ${
                entry
                  ? '-mx-2 cursor-pointer rounded-lg px-2 transition-colors hover:bg-[var(--color-bg)]'
                  : ''
              }`}
              onClick={() => entry && onSelectActivity?.(entry.activity)}
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-xs text-[var(--color-text)]">
                  {isZh ? target.zh : target.en}
                </span>
                <span className="truncate text-[10px] text-[var(--color-muted)]">
                  {entry ? `${date} · ${source}` : '--'}
                </span>
              </span>
              <span
                className={`font-mono text-xs font-bold ${entry ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
              >
                {entry ? formatTime(entry.seconds) : '--'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
