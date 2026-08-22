import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStation, selectors } from '../store/useStation';
import { effectiveDue, nextBlock, remainingMin } from '../lib/planner';
import type { Block, Item } from '../lib/types';
import {
  clockLabel,
  d,
  differenceInMinutes,
  dueLabel,
  durationLabel,
  isSameDay,
  relativeDayLabel,
} from '../lib/time';
import { FieldHelp, Icon, courseColor } from './ui';

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
    else if (hours < 24) parts.push(`Due ${dueLabel(deadline, now)}, so this is the last real window`);
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

  if (block.late) parts.push('this slot lands after the deadline, since the day is already full');

  return parts.join(', ') + '.';
}

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/* Stripe pace, as a multiple of the sweep's nominal speed. Pressing Start
   kicks it to a sprint, which then coasts back down to the running pace. */
const RATE_IDLE = 1;
const RATE_RUNNING = 2;
const RATE_KICK = 8;
const KICK_MS = 3000;
const SETTLE_MS = 1200;

/**
 * The one thing to work on right now, with a timer. Sits at the top of the
 * View page — the answer comes before the overview that justifies it.
 */
export function NowCard() {
  const { items, courses, blocks, completeBlock, skipBlock, logProgress } = useStation();
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState<'done' | 'skip' | null>(null);
  const startedAt = useRef<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const rate = useRef(RATE_IDLE);
  const ramp = useRef<number | null>(null);

  // Confirmation flash on the button you just pressed.
  const flashOn = (which: 'done' | 'skip') => {
    setFlash(which);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 700);
  };
  useEffect(() => () => void (flashTimer.current && clearTimeout(flashTimer.current)), []);

  // Pace lives on the sweep's playbackRate, not its duration: retiming a
  // running animation jumps the gradient, rescaling it doesn't — which is what
  // makes a gradual slowdown possible at all.
  const applyRate = (r: number) => {
    rate.current = r;
    const sweep = card.current
      ?.getAnimations({ subtree: true })
      .find((a) => (a as Animation & { animationName?: string }).animationName === 'stripe-sweep');
    if (sweep) sweep.playbackRate = r;
  };

  // Eases the pace to `to` over `ms`. Cubic ease-out, so most of the slowdown
  // lands early and the stripe coasts the rest of the way in.
  const rampRate = (to: number, ms: number) => {
    if (ramp.current) cancelAnimationFrame(ramp.current);
    const from = rate.current;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      applyRate(from + (to - from) * (1 - (1 - p) ** 3));
      ramp.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    ramp.current = requestAnimationFrame(step);
  };

  // Start sprints the stripe, then hands it three seconds to settle at double
  // its idle pace; pausing walks it back down to idle the same way.
  useEffect(() => {
    if (running) {
      applyRate(RATE_KICK);
      rampRate(RATE_RUNNING, KICK_MS);
    } else {
      rampRate(RATE_IDLE, SETTLE_MS);
    }
    return () => void (ramp.current && cancelAnimationFrame(ramp.current));
  }, [running]);

  // A class change on the card can re-create the CSS animation, which would
  // reset it to nominal speed; re-assert the pace we're holding.
  useEffect(() => {
    if (!ramp.current) applyRate(rate.current);
  });

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
  // Last minute of the block — the stripe bleeds from its sweep to red one
  // second at a time, so running out of time is felt before the clock is read.
  const urgency = elapsed > 0 ? Math.min(1, Math.max(0, (60 - (planned - elapsed)) / 60)) : 0;

  const clock = `${over ? '+' : ''}${fmt(over ? elapsed - planned : Math.max(0, planned - elapsed))}`;

  const stop = (logMinutes: number) => {
    setRunning(false);
    startedAt.current = null;
    if (logMinutes > 0) logProgress(item.id, logMinutes);
    setElapsed(0);
  };

  return (
    <div
      ref={card}
      className={`card now-card${urgency >= 1 ? ' is-spent' : ''}`}
      style={{ '--urgency': urgency } as CSSProperties}
    >
      <div className="now-body">
        <div className="now-kicker">
          <span className="pulse" />
          <span className="label">{active ? 'Do this now' : `Up next · ${clockLabel(current.start)}`}</span>
          {!isSameDay(d(current.start), now) && <span>{relativeDayLabel(d(current.start), now)}</span>}
          {course && (
            <span className="chip">
              <span className="chip-dot" style={{ background: courseColor(course.hue) }} />
              {course.name}
            </span>
          )}
          <span className="chip">
            <Icon name="clock" size={11} /> {durationLabel(current.minutes)}
          </span>
          {current.late && <span className="chip chip-warn">past the deadline</span>}
        </div>

        <h2 className="now-title">
          {item.title}
          <FieldHelp title="Why this?">{explain(item, current, items, now)}</FieldHelp>
        </h2>

        {item.url && (
          <div className="row" style={{ marginTop: 14, justifyContent: 'center' }}>
            <a className="btn btn-sm" href={item.url} target="_blank" rel="noreferrer">
              <Icon name="link" size={12} /> Open it
            </a>
          </div>
        )}
      </div>

      <div className="now-timer">
        <div className="timer">
          <div className={`timer-clock${over ? ' is-over' : ''}`}>{clock}</div>
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
            className={`btn btn-lg${flash === 'done' ? ' btn-flash-ok' : ''}`}
            onClick={() => {
              flashOn('done');
              stop(0);
              completeBlock(current.id);
            }}
          >
            <Icon name="check" size={13} /> Done
          </button>
          <button
            className={`btn btn-ghost btn-lg${flash === 'skip' ? ' btn-flash-yellow' : ''}`}
            onClick={() => {
              flashOn('skip');
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
