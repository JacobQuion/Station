import { useMemo, useState } from 'react';
import { useStation } from '../store/useStation';
import { buildReport, toColumns, type DayStat, type Range } from '../lib/analytics';
import { durationLabel, format, isSameDay } from '../lib/time';
import { Empty, Icon, courseColor } from '../components/ui';

const RANGES: Array<{ id: Range; label: string }> = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
  { id: 'all', label: 'All' },
];

/** Courses shown by name in the split; the tail is summed into one row. */
const COURSE_ROWS = 6;

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** "+2h 10m" / "-45m" / "even" — the delta line under a stat. */
function deltaLabel(now: number, before: number, unit: (n: number) => string) {
  const diff = Math.round(now - before);
  if (diff === 0) return 'even';
  return `${diff > 0 ? '+' : '−'}${unit(Math.abs(diff))}`;
}

/**
 * The record of what actually happened: finished blocks, finished tasks, and
 * the shape of both over time. The rest of the app looks forward — this is the
 * only page that looks back, which is what makes it worth a tab of its own.
 */
export function Analyze() {
  const { items, blocks, courses, settings } = useStation();
  const [range, setRange] = useState<Range>(30);
  const [hover, setHover] = useState<DayStat | null>(null);
  const [query, setQuery] = useState('');
  const now = new Date();

  const report = useMemo(
    () => buildReport({ items, blocks, courses, range }),
    // `now` is deliberately not a dependency: the report is day-grained, and
    // re-deriving it on every render would throw away the hover state.
    [items, blocks, courses, range]
  );

  const columns = useMemo(() => toColumns(report.days), [report.days]);
  const weekly = columns.length !== report.days.length;

  const goal = weekly ? settings.dailyCapacityMin * 7 : settings.dailyCapacityMin;

  // Round the ceiling up to a whole hour so the axis reads in clean numbers.
  // The goal line pulls the ceiling up with it, but only when it's within
  // reach — an ambitious goal shouldn't flatten the days you actually worked.
  const peak = Math.max(...columns.map((c) => c.focusMin + c.missedMin), 60);
  const ceiling = Math.ceil(Math.max(peak, goal <= peak * 1.5 ? goal : 0) / 60) * 60;
  const step = ceiling <= 240 ? 60 : ceiling <= 720 ? 120 : Math.ceil(ceiling / 4 / 60) * 60;
  const ticks: number[] = [];
  for (let t = 0; t <= ceiling; t += step) ticks.push(t);
  // Bars stop at 88% of the plot so a column's value label has headroom.
  const pct = (v: number) => (v / ceiling) * 88;

  const courseRows = useMemo(() => {
    const top = report.byCourse.slice(0, COURSE_ROWS);
    const rest = report.byCourse.slice(COURSE_ROWS);
    if (rest.length) {
      top.push({
        id: 'other',
        name: `${rest.length} more courses`,
        minutes: rest.reduce((s, c) => s + c.minutes, 0),
      });
    }
    return top;
  }, [report.byCourse]);

  const courseMax = Math.max(...courseRows.map((c) => c.minutes), 1);
  const weekdayMax = Math.max(...report.byWeekday, 1);
  const bestWeekday = report.byWeekday.indexOf(Math.max(...report.byWeekday));

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return report.completed;
    return report.completed.filter(
      (c) => c.item.title.toLowerCase().includes(q) || (c.course?.name.toLowerCase().includes(q) ?? false)
    );
  }, [report.completed, query]);

  const nothingYet = report.blocksDone === 0 && report.completed.length === 0;

  return (
    <div className="wide">
      <div className="page-head row wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>How it's actually going.</h1>
          <p>
            {nothingYet
              ? 'Finish a block on the View page and the record starts here.'
              : `${durationLabel(report.focusMin)} of focus and ${report.completed.length} ${
                  report.completed.length === 1 ? 'task' : 'tasks'
                } finished since ${format(report.from, 'MMM d')}.`}
          </p>
        </div>
        <div className="an-range" role="group" aria-label="Reporting period">
          {RANGES.map((r) => (
            <button
              key={String(r.id)}
              className="an-range-btn"
              aria-pressed={range === r.id}
              onClick={() => {
                setRange(r.id);
                setHover(null);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {nothingYet ? (
        <div className="card card-pad">
          <Empty title="No history yet">
            <p style={{ marginTop: 8 }}>
              Every block you finish and every task you tick off is recorded. Come back once a few are done
              and this page will show where the hours went.
            </p>
          </Empty>
        </div>
      ) : (
        <div className="grid" style={{ gap: 16 }}>
          <div className="an-kpis">
            <div className="card an-stat">
              <span className="an-stat-label">Focus logged</span>
              <strong className="an-stat-value">{durationLabel(report.focusMin)}</strong>
              <span className="an-stat-sub">
                {deltaLabel(report.focusMin, report.prevFocusMin, durationLabel)} vs the period before
              </span>
            </div>

            <div className="card an-stat">
              <span className="an-stat-label">Tasks finished</span>
              <strong className="an-stat-value">{report.completed.length}</strong>
              <span className="an-stat-sub">
                {deltaLabel(report.completed.length, report.prevCompletedCount, (n) => String(n))} vs the
                period before
              </span>
            </div>

            <div className="card an-stat">
              <span className="an-stat-label">Follow-through</span>
              <strong className="an-stat-value">
                {report.followThrough === null ? '—' : `${Math.round(report.followThrough * 100)}%`}
              </strong>
              <span
                className="an-meter"
                role="img"
                aria-label={`${report.blocksDone} blocks done, ${report.blocksMissed} missed`}
              >
                <i style={{ width: `${(report.followThrough ?? 0) * 100}%` }} />
              </span>
              <span className="an-stat-sub">
                {report.blocksDone} done · {report.blocksMissed} missed
              </span>
            </div>

            <div className="card an-stat">
              <span className="an-stat-label">Streak</span>
              <strong className="an-stat-value">
                {report.streak}
                <em>{report.streak === 1 ? 'day' : 'days'}</em>
              </strong>
              <span className="an-stat-sub">best in this period: {report.bestStreak}</span>
            </div>
          </div>

          <div className="card card-pad">
            <div className="section-head">
              <h2>Focus logged</h2>
              <span className="count">
                {hover
                  ? `${format(hover.date, weekly ? "'week of' MMM d" : 'EEE MMM d')} · ${durationLabel(
                      hover.focusMin
                    )}${hover.missedMin ? ` · ${durationLabel(hover.missedMin)} missed` : ''}`
                  : `${weekly ? 'per week' : 'per day'} · goal ${durationLabel(goal)}`}
              </span>
            </div>

            <div className="an-plot" onMouseLeave={() => setHover(null)}>
              <div className="an-axis">
                {ticks.map((t) => (
                  <span key={t} style={{ bottom: `${pct(t)}%` }}>
                    {t === 0 ? '0' : durationLabel(t)}
                  </span>
                ))}
              </div>

              <div
                className="an-cols"
                style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
              >
                <div className="an-grid">
                  {ticks.map((t) => (
                    <i key={t} style={{ bottom: `${pct(t)}%` }} />
                  ))}
                  {goal > 0 && goal <= ceiling && (
                    <b style={{ bottom: `${pct(goal)}%` }}>
                      <span>goal</span>
                    </b>
                  )}
                </div>

                {columns.map((col) => {
                  const today = !weekly && isSameDay(col.date, now);
                  const label = `${format(col.date, weekly ? "'week of' MMM d" : 'EEE MMM d')}: ${durationLabel(
                    col.focusMin
                  )} focused${col.missed ? `, ${col.missed} blocks missed` : ''}`;
                  return (
                    <div
                      key={col.key}
                      className={`an-col${today ? ' is-today' : ''}${hover?.key === col.key ? ' is-hot' : ''}`}
                      role="img"
                      aria-label={label}
                      tabIndex={0}
                      onMouseEnter={() => setHover(col)}
                      onFocus={() => setHover(col)}
                      onBlur={() => setHover(null)}
                    >
                      <div className="an-bar">
                        <div className="an-stack">
                          {col.missedMin > 0 && (
                            <div className="an-seg missed" style={{ height: `${pct(col.missedMin)}%` }} />
                          )}
                          <div className="an-seg focus" style={{ height: `${pct(col.focusMin)}%` }} />
                        </div>
                      </div>
                      <span className="an-tick">{col.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="an-key">
              <span>
                <i className="k focus" /> focused
              </span>
              <span>
                <i className="k missed" /> missed
              </span>
              {weekly && <span className="an-key-note">one column per week</span>}
            </div>
          </div>

          <div className="an-split">
            <div className="card card-pad">
              <div className="section-head">
                <h2>Where the time went</h2>
                <span className="count">{durationLabel(report.focusMin)}</span>
              </div>
              {courseRows.length === 0 ? (
                <Empty title="No finished blocks in this period" />
              ) : (
                <ul className="an-bars">
                  {courseRows.map((c) => (
                    <li key={c.id}>
                      <span className="an-bars-name">
                        <i className="chip-dot" style={{ background: courseColor(c.hue) }} />
                        {c.name}
                      </span>
                      <span className="an-bars-track">
                        <i
                          style={{
                            width: `${(c.minutes / courseMax) * 100}%`,
                            background: courseColor(c.hue),
                          }}
                        />
                      </span>
                      <span className="an-bars-val mono">{durationLabel(c.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card card-pad">
              <div className="section-head">
                <h2>Your week</h2>
                <span className="count">average per day</span>
              </div>
              <div className="an-week">
                {report.byWeekday.map((minutes, i) => (
                  <div
                    className={`an-week-col${i === bestWeekday && minutes > 0 ? ' is-best' : ''}`}
                    key={i}
                    role="img"
                    aria-label={`${format(new Date(2024, 0, 7 + i), 'EEEE')}: ${durationLabel(minutes)} on average`}
                  >
                    <div className="an-week-plot">
                      <i style={{ height: `${(minutes / weekdayMax) * 100}%` }} />
                    </div>
                    <span className="an-week-day">{WEEKDAYS[i]}</span>
                  </div>
                ))}
              </div>
              <p className="an-note">
                {report.byWeekday[bestWeekday] > 0
                  ? `${format(new Date(2024, 0, 7 + bestWeekday), 'EEEE')} is your strongest day, at ${durationLabel(
                      report.byWeekday[bestWeekday]
                    )} on average.`
                  : 'No pattern yet.'}
              </p>
            </div>
          </div>

          <div className="card card-pad">
            <div className="section-head">
              <h2>Completed</h2>
              <span className="count">
                {query ? `${found.length} of ${report.completed.length}` : report.completed.length}
              </span>
              <label className="an-search">
                <Icon name="search" size={13} />
                <input
                  className="input"
                  type="search"
                  value={query}
                  placeholder="Search finished work"
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search completed tasks"
                />
              </label>
            </div>

            {report.estimateBias !== null && (
              <p className="an-note" style={{ marginBottom: 12 }}>
                {report.estimateBias > 1.1
                  ? `These took about ${Math.round((report.estimateBias - 1) * 100)}% longer than you estimated.`
                  : report.estimateBias < 0.9
                    ? `These came in about ${Math.round((1 - report.estimateBias) * 100)}% under your estimates.`
                    : 'Your estimates are landing within 10% of the real thing.'}
              </p>
            )}

            {found.length === 0 ? (
              <Empty title={query ? 'Nothing matches that' : 'Nothing finished in this period yet'} />
            ) : (
              <div className="an-list task-scroll">
                {found.map((c) => (
                  <div
                    className="an-row"
                    key={c.item.id}
                    style={{ borderLeftColor: courseColor(c.course?.hue) }}
                  >
                    <div className="an-row-main">
                      <div className="entry-title" title={c.item.title}>
                        {c.item.title}
                      </div>
                      <div className="entry-sub">
                        {c.course && (
                          <span style={{ color: courseColor(c.course.hue) }}>{c.course.name}</span>
                        )}
                        <span>{format(c.at, 'MMM d')}</span>
                        {c.onTime === false && <span className="warn-text">late</span>}
                      </div>
                    </div>
                    <div className="an-row-val">
                      <span className="mono">{durationLabel(c.loggedMin)}</span>
                      <span className="an-row-est">
                        {c.estimateMin > 0 ? `est. ${durationLabel(c.estimateMin)}` : 'no estimate'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
