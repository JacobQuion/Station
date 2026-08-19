import { useEffect, useMemo, useRef, useState } from 'react';
import { useStation } from '../store/useStation';
import { selectors } from '../store/useStation';
import { effectiveDue, nextBlock, remainingMin } from '../lib/planner';
import type { Block, Item } from '../lib/types';
import {
  addDays,
  clockLabel,
  d,
  differenceInMinutes,
  dueLabel,
  durationLabel,
  isSameDay,
  relativeDayLabel,
} from '../lib/time';
import { Empty, Icon, courseColor } from '../components/ui';

/**
 * Explains the planner's choice in one sentence. The scheduling is only
 * trustworthy if you can see the reasoning, so this reads the same signals
 * `plan()` sorted on and says them out loud.
 */
function explain(item: Item, block: Block, all: Item[], now: Date): string {
  const left = remainingMin(item);
  const deadline = item.due ?? item.start;
  const parts: string[] = [];

  if (deadline) {
    const hours = differenceInMinutes(d(deadline), now) / 60;
    if (hours < 0) parts.push(`It's already past due`);
    else if (hours < 24) parts.push(`Due ${dueLabel(deadline, now)} — this is the last real window`);
    else if (hours < 72)
      parts.push(`Due ${dueLabel(deadline, now)}, and ${durationLabel(left)} of work is still open`);
    else parts.push(`Due ${dueLabel(deadline, now)}; starting now keeps it off next week`);
  } else {
    parts.push(`No deadline, so it fills the gap`);
  }

  if (item.kind === 'exam') parts.push('exams get their study time front-loaded');
  else if (item.priority === 3) parts.push('you marked it high priority');

  const sooner = all.filter(
    (i) =>
      i.id !== item.id &&
      i.status === 'todo' &&
      remainingMin(i) > 0 &&
      +effectiveDue(i, now) < +effectiveDue(item, now)
  ).length;
  if (sooner === 0) parts.push('nothing else is due sooner');

  if (block.late) parts.push('this slot lands after the deadline — the day is already full');

  return parts.join(', ') + '.';
}

export function Focus({ onGoImport }: { onGoImport: () => void }) {
  const { items, courses, blocks, completeBlock, skipBlock, replan, logProgress } = useStation();
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  const now = useMemo(() => new Date(), [tick]);
  const itemById = useMemo(() => selectors.itemById(items), [items]);
  const courseById = useMemo(() => selectors.courseById(courses), [courses]);

  const current = useMemo(() => nextBlock(blocks, now), [blocks, now]);
  const item = current ? itemById.get(current.itemId) : undefined;

  // One shared heartbeat drives both the clock and the running timer.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (running && startedAt.current !== null) {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Switching to a different block resets the stopwatch.
  useEffect(() => {
    setRunning(false);
    setElapsed(0);
    startedAt.current = null;
  }, [current?.id]);

  /**
   * The planner splits a long task into several back-to-back chunks, which is
   * right for the schedule but reads as noise in a queue — "Lab Report" four
   * times running. Collapse each consecutive run into one line.
   */
  const queue = useMemo(() => {
    const upcoming = blocks
      .filter((b) => b.status === 'planned' && b.id !== current?.id && d(b.start) >= now)
      .sort((a, b) => a.start.localeCompare(b.start));

    const runs: Array<{
      item: Item;
      start: string;
      minutes: number;
      parts: number;
    }> = [];
    for (const b of upcoming) {
      const item = itemById.get(b.itemId);
      if (!item) continue;
      const last = runs[runs.length - 1];
      if (last && last.item.id === item.id && isSameDay(d(last.start), d(b.start))) {
        last.minutes += b.minutes;
        last.parts += 1;
      } else {
        runs.push({ item, start: b.start, minutes: b.minutes, parts: 1 });
      }
      if (runs.length > 8) break;
    }
    return runs.slice(0, 5);
  }, [blocks, current, itemById, now]);

  const behind = blocks.filter((b) => b.status === 'missed' && +d(b.end) > +addDays(now, -3)).length;

  if (!items.length) {
    return (
      <div className="card card-pad">
        <Empty title="Nothing imported yet">
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={onGoImport}>
              Import your schedule
            </button>
          </div>
        </Empty>
      </div>
    );
  }

  if (!current || !item) {
    const doneToday = blocks.filter((b) => b.status === 'done' && isSameDay(d(b.start), now));
    const minutes = doneToday.reduce((s, b) => s + b.minutes, 0);
    return (
      <>
        <div className="page-head">
          <h1>You're clear.</h1>
          <p>
            Nothing is scheduled right now
            {minutes > 0 ? ` — you've logged ${durationLabel(minutes)} today.` : '.'}
          </p>
        </div>
        <div className="card card-pad">
          <Empty title="No work blocks left in the plan">
            Everything with a deadline is either scheduled past the horizon or already handled.
            <div style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => replan()}>
                <Icon name="refresh" size={13} /> Rebuild the plan
              </button>
            </div>
          </Empty>
        </div>
      </>
    );
  }

  const course = courseById.get(item.courseId ?? '');
  const planned = current.minutes * 60;
  const isActive = d(current.start) <= now && d(current.end) > now;
  const remainingSec = Math.max(0, planned - elapsed);
  const over = elapsed > planned;
  const pct = Math.min(100, (elapsed / planned) * 100);

  const stop = (logMinutes: number) => {
    setRunning(false);
    startedAt.current = null;
    if (logMinutes > 0) logProgress(item.id, logMinutes);
    setElapsed(0);
  };

  return (
    <>
      <div className="page-head row wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>Do this next.</h1>
          <p>
            {behind > 0
              ? `You missed ${behind} block${behind === 1 ? '' : 's'} recently — that work has already been moved forward.`
              : 'One thing at a time. Station handles the order.'}
          </p>
        </div>
        <button className="btn" onClick={() => replan()}>
          <Icon name="refresh" size={13} /> Replan around now
        </button>
      </div>

      <div className="focus-wrap">
        <div>
          <div className="card now-card">
            <div className="now-kicker">
              <span className="pulse" />
              <span className="label">
                {isActive ? 'Happening now' : `Up next · ${clockLabel(current.start)}`}
              </span>
              {!isSameDay(d(current.start), now) && (
                <span className="chip">{relativeDayLabel(d(current.start), now)}</span>
              )}
            </div>

            <h2 className="now-title">{item.title}</h2>

            <div className="now-meta">
              {course && <span style={{ color: courseColor(course.hue) }}>{course.name}</span>}
              <span>{durationLabel(current.minutes)}</span>
              {/* Only worth saying when this block isn't the whole job. */}
              {remainingMin(item) > current.minutes && <span>{durationLabel(remainingMin(item))} left</span>}
              {item.due && (
                <span className={d(item.due) < addDays(now, 1) ? 'warn-text' : undefined}>
                  due {dueLabel(item.due, now)}
                </span>
              )}
              {current.late && <span className="warn-text">past the deadline</span>}
            </div>

            <p className="now-why">
              <b>Why this:</b> {explain(item, current, items, now)}
            </p>

            <div className="timer">
              <div className="ring" style={{ ['--p' as string]: pct }}>
                <span
                  style={{
                    position: 'absolute',
                    font: '600 12px var(--mono)',
                    color: 'var(--text-2)',
                  }}
                >
                  {Math.round(pct)}%
                </span>
              </div>
              <div>
                <div className={`timer-clock${over ? ' is-over' : ''}`}>
                  {over ? '+' : ''}
                  {fmt(over ? elapsed - planned : remainingSec)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {running
                    ? over
                      ? 'over the planned block'
                      : 'remaining in this block'
                    : 'ready when you are'}
                </div>
              </div>

              <div className="spacer" />

              <div className="timer-actions">
                {!running ? (
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={() => {
                      startedAt.current = Date.now() - elapsed * 1000;
                      setRunning(true);
                    }}
                  >
                    <Icon name="play" size={13} /> {elapsed > 0 ? 'Resume' : 'Start'}
                  </button>
                ) : (
                  <button className="btn btn-lg" onClick={() => setRunning(false)}>
                    <Icon name="pause" size={13} /> Pause
                  </button>
                )}
                <button
                  className="btn btn-lg"
                  onClick={() => {
                    stop(0);
                    completeBlock(current.id);
                  }}
                >
                  <Icon name="check" size={13} /> Done
                </button>
                <button
                  className="btn btn-ghost btn-lg"
                  onClick={() => {
                    stop(Math.floor(elapsed / 60));
                    skipBlock(current.id);
                  }}
                >
                  <Icon name="skip" size={13} /> Skip
                </button>
              </div>
            </div>

            {item.url && (
              <div className="row" style={{ marginTop: 14 }}>
                <a className="btn btn-sm" href={item.url} target="_blank" rel="noreferrer">
                  <Icon name="link" size={12} /> Open it
                </a>
              </div>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="section-head">
              <h2>Today's progress</h2>
            </div>
            <div className="card card-pad">
              <TodayProgress />
            </div>
          </div>
        </div>

        <div className="grid" style={{ gap: 20 }}>
          <div>
            <div className="section-head">
              <h2>Then</h2>
              <span className="count">{queue.length}</span>
            </div>
            <div className="card card-pad" style={{ padding: 8 }}>
              {queue.length === 0 ? (
                <Empty title="That's the last block" />
              ) : (
                queue.map((run, i) => (
                  <div className="queue-item" key={run.start + run.item.id}>
                    <span className="idx">{i + 1}</span>
                    <i
                      style={{
                        width: 3,
                        alignSelf: 'stretch',
                        borderRadius: 2,
                        background: courseColor(courseById.get(run.item.courseId ?? '')?.hue),
                      }}
                    />
                    <div className="meta">
                      <strong>{run.item.title}</strong>
                      <span>
                        {isSameDay(d(run.start), now)
                          ? clockLabel(run.start)
                          : relativeDayLabel(d(run.start), now)}
                        {' · '}
                        {durationLabel(run.minutes)}
                        {run.parts > 1 && ` · ${run.parts} blocks`}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TodayProgress() {
  const { blocks, settings } = useStation();
  const now = new Date();
  const today = blocks.filter((b) => isSameDay(d(b.start), now));
  const done = today.filter((b) => b.status === 'done').reduce((s, b) => s + b.minutes, 0);
  const planned = today.filter((b) => b.status === 'planned').reduce((s, b) => s + b.minutes, 0);
  const missed = today.filter((b) => b.status === 'missed').reduce((s, b) => s + b.minutes, 0);
  const cap = Math.max(settings.dailyCapacityMin, done + planned, 1);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>
          {durationLabel(done)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          of {durationLabel(done + planned)} planned
        </span>
      </div>
      <div className="bar" style={{ height: 10 }}>
        <i style={{ width: `${(done / cap) * 100}%`, background: 'var(--ok)' }} />
        <i
          style={{
            width: `${(planned / cap) * 100}%`,
            background: 'var(--accent)',
            opacity: 0.55,
          }}
        />
        <i
          style={{
            width: `${(missed / cap) * 100}%`,
            background: 'var(--danger)',
            opacity: 0.4,
          }}
        />
      </div>
    </>
  );
}

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
