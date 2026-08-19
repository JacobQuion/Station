import { useEffect, useMemo, useRef, useState } from 'react';
import { useStation, selectors } from '../store/useStation';
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
import { Icon, courseColor } from './ui';

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

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The one thing to work on right now, with a timer. Sits at the top of the
 * View page — the answer comes before the overview that justifies it.
 */
export function NowCard() {
  const { items, courses, blocks, completeBlock, skipBlock, logProgress } = useStation();
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

  if (!current || !item) {
    const done = blocks
      .filter((b) => b.status === 'done' && isSameDay(d(b.start), now))
      .reduce((s, b) => s + b.minutes, 0);
    return (
      <div className="card now-card is-clear">
        <div className="now-kicker">
          <span className="label">Nothing scheduled</span>
        </div>
        <h2 className="now-title">You're clear.</h2>
        <div className="now-meta">
          <span>{done > 0 ? `${durationLabel(done)} logged today` : 'No work blocks left in the plan'}</span>
        </div>
      </div>
    );
  }

  const course = courseById.get(item.courseId ?? '');
  const planned = current.minutes * 60;
  const active = d(current.start) <= now && d(current.end) > now;
  const over = elapsed > planned;
  const pct = Math.min(100, (elapsed / planned) * 100);
  // Last minute of the block — the stripe goes red so it reads from across the room.
  const urgent = elapsed > 0 && planned - elapsed <= 60;

  const stop = (logMinutes: number) => {
    setRunning(false);
    startedAt.current = null;
    if (logMinutes > 0) logProgress(item.id, logMinutes);
    setElapsed(0);
  };

  return (
    <div className={`card now-card${urgent ? ' is-urgent' : ''}`}>
      <div className="now-body">
        <div className="now-kicker">
          <span className="pulse" />
          <span className="label">{active ? 'Do this now' : `Up next · ${clockLabel(current.start)}`}</span>
          {!isSameDay(d(current.start), now) && <span>{relativeDayLabel(d(current.start), now)}</span>}
        </div>

        <h2 className="now-title">{item.title}</h2>

        <div className="now-meta">
          {course && <span style={{ color: courseColor(course.hue) }}>{course.name}</span>}
          <span>{durationLabel(current.minutes)}</span>
          {remainingMin(item) > current.minutes && <span>{durationLabel(remainingMin(item))} left</span>}
          {item.due && (
            <span className={d(item.due) < addDays(now, 1) ? 'warn-text' : undefined}>
              due {dueLabel(item.due, now)}
            </span>
          )}
          {current.late && <span className="warn-text">past the deadline</span>}
        </div>

        {item.url && (
          <div className="row" style={{ marginTop: 14 }}>
            <a className="btn btn-sm" href={item.url} target="_blank" rel="noreferrer">
              <Icon name="link" size={12} /> Open it
            </a>
          </div>
        )}
      </div>

      <div className="now-timer">
        <p className="now-why">
          <b>Why this:</b> {explain(item, current, items, now)}
        </p>

        <div className="timer">
          <div className={`ring${over ? ' is-over' : ''}`} style={{ ['--p' as string]: pct }}>
          <span className="ring-label">{Math.round(pct)}%</span>
        </div>
          <div>
            <div className={`timer-clock${over ? ' is-over' : ''}`}>
              {over ? '+' : ''}
              {fmt(over ? elapsed - planned : Math.max(0, planned - elapsed))}
            </div>
            <div className="timer-sub">
              {running ? (over ? 'over the block' : 'remaining') : 'ready when you are'}
            </div>
          </div>
        </div>

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
    </div>
  );
}
