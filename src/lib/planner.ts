import type { Block, Item, PlanResult, Risk, Settings } from './types';
import {
  addDays,
  atMinutes,
  d,
  dayKey,
  iso,
  merge,
  mins,
  roundUp5,
  startOfDay,
  subtract,
  type Interval,
} from './time';
import { newId } from './id';

const HOUR = 60;
/** One second, in minutes. Work below this is a rounding residue, not a task. */
const EPS = 1 / 60;

export const remainingMin = (i: Item) =>
  i.status === 'done' ? 0 : Math.max(0, i.estimateMin - i.progressMin);

/**
 * Something you have to physically be at, so the planner must route around it.
 * All-day markers (holidays, term boundaries) are deliberately excluded — they
 * belong on the calendar, but they don't stop you working.
 */
export const isCommitment = (i: Item) =>
  Boolean(i.start && i.end) && !i.allDay && (i.kind === 'class' || i.kind === 'event' || i.kind === 'exam');

/** Work the planner is allowed to schedule: has effort left and isn't a fixed commitment. */
export const isWorkable = (i: Item) =>
  i.status === 'todo' &&
  remainingMin(i) > 0 &&
  (i.kind === 'assignment' || i.kind === 'task' || i.kind === 'exam');

/**
 * Effective deadline = the real deadline pulled earlier for high-priority work
 * and for exams (you have to be ready *before* you sit down, not at the bell).
 * Sorting by this gives us earliest-deadline-first, which is provably optimal
 * for feasibility on a single "machine", while still respecting priority.
 */
export function effectiveDue(item: Item, now: Date): Date {
  const raw = item.due ? d(item.due) : item.start ? d(item.start) : addDays(now, 21);
  let shift = 0;
  if (item.priority === 3) shift += 12 * HOUR;
  if (item.priority === 1) shift -= 6 * HOUR;
  if (item.kind === 'exam') shift += 12 * HOUR;
  return new Date(+raw - shift * 60_000);
}

/** Free windows for one day, after removing commitments and honouring capacity. */
function daySlots(day: Date, now: Date, busy: Interval[], s: Settings): Interval[] {
  if (s.daysOff.includes(day.getDay())) return [];

  const open = atMinutes(day, s.dayStartMin);
  const close = atMinutes(day, s.dayEndMin);
  const from = now > open ? roundUp5(now) : open;
  if (from >= close) return [];

  const padded = busy.map((b) => ({
    start: new Date(+b.start - s.commuteMin * 60_000),
    end: new Date(+b.end + s.commuteMin * 60_000),
  }));

  // Keep anything non-trivial; `take` applies the real minimum, so a short
  // gap can still absorb the last few minutes of an almost-finished item.
  return subtract([{ start: from, end: close }], padded).filter((slot) => mins(slot.start, slot.end) >= 5);
}

interface Cursor {
  slots: Interval[];
  used: number;
  capacity: number;
}

/**
 * Takes up to `want` minutes out of a day's remaining free time, never running
 * past `notAfter`. The deadline is checked *before* the slot is consumed —
 * otherwise a rejected placement would still burn the window for everyone else.
 */
function take(cursor: Cursor, want: number, s: Settings, notAfter: Date | null): Interval | null {
  // `minBlockMin` exists to stop the planner shredding big tasks into useless
  // fragments. It shouldn't strand the *tail* of an almost-finished item, so
  // when the work left is already smaller than the minimum, that becomes the
  // minimum — otherwise a 10-minute remainder reads as "won't fit".
  if (want < EPS) return null;
  const floor = Math.min(s.minBlockMin, want);
  const budget = Math.min(want, cursor.capacity - cursor.used);
  if (budget < floor || budget < EPS) return null;

  for (let i = 0; i < cursor.slots.length; i++) {
    const slot = cursor.slots[i];
    const free = mins(slot.start, slot.end);
    if (free < floor) continue;

    const length = Math.min(budget, free, s.focusMin);
    if (length < floor) continue;

    const start = new Date(slot.start);
    const end = new Date(+start + Math.round(length * 1000) * 60);
    if (notAfter && end > notAfter) continue;

    // Consume the slot plus a break, so back-to-back blocks aren't punishing.
    const resume = new Date(+end + s.breakMin * 60_000);
    if (resume >= slot.end) cursor.slots.splice(i, 1);
    else slot.start = resume;

    cursor.used += length;
    return { start, end };
  }
  return null;
}

export interface PlanOptions {
  items: Item[];
  settings: Settings;
  now?: Date;
  /** Blocks already marked done/missed — history the planner must not rewrite. */
  history?: Block[];
}

/**
 * Rebuilds the entire forward schedule from `now`.
 *
 * Pass 1 places every item's remaining work before its effective deadline, in
 * deadline order. Pass 2 sweeps up anything that didn't fit and parks it in the
 * earliest free time it can find, flagged `late` — so "what's next" is never
 * empty and the shortfall stays visible instead of silently vanishing.
 */
export function plan({ items, settings: s, now = new Date(), history = [] }: PlanOptions): PlanResult {
  const commitments = merge(
    items
      .filter((i) => isCommitment(i) && i.status !== 'archived')
      .map((i) => ({ start: d(i.start!), end: d(i.end!) }))
  );

  // Time already committed to today's finished/in-flight blocks stays blocked out.
  const kept = history.filter((b) => b.status !== 'planned');
  const keptBusy = merge(kept.map((b) => ({ start: d(b.start), end: d(b.end) })));

  const days: Array<{ key: string; date: Date; cursor: Cursor }> = [];
  for (let n = 0; n < s.horizonDays; n++) {
    const date = startOfDay(addDays(now, n));
    const busy = merge([
      ...commitments.filter((c) => dayKey(c.start) === dayKey(date)),
      ...keptBusy.filter((c) => dayKey(c.start) === dayKey(date)),
    ]);
    const slots = daySlots(date, now, busy, s);
    const usedToday = kept
      .filter((b) => dayKey(b.start) === dayKey(date) && b.status === 'done')
      .reduce((sum, b) => sum + b.minutes, 0);
    days.push({
      key: dayKey(date),
      date,
      cursor: { slots, used: usedToday, capacity: s.dailyCapacityMin },
    });
  }

  const workable = items.filter(isWorkable);
  const outstanding = new Map<string, number>(workable.map((i) => [i.id, remainingMin(i)]));
  const blocks: Block[] = [];

  const place = (item: Item, deadline: Date | null) => {
    let left = outstanding.get(item.id) ?? 0;
    for (const day of days) {
      if (left <= EPS) break;
      if (deadline && day.date > deadline) break;
      // Bounded by how many blocks a day could physically hold, so an unusual
      // capacity/block-size combination can't cut a day short.
      const maxBlocks = Math.ceil(s.dailyCapacityMin / Math.max(5, s.minBlockMin)) + 2;
      for (let attempt = 0; attempt < maxBlocks && left > EPS; attempt++) {
        const slot = take(day.cursor, left, s, deadline);
        if (!slot) break;
        const minutes = (+slot.end - +slot.start) / 60_000;
        blocks.push({
          id: newId('blk'),
          itemId: item.id,
          start: iso(slot.start),
          end: iso(slot.end),
          minutes,
          status: 'planned',
          late: deadline === null,
        });
        left -= minutes;
      }
    }
    outstanding.set(item.id, left > EPS ? left : 0);
  };

  // Pass 1 — fit everything inside its deadline, most urgent first.
  const byDeadline = [...workable].sort((a, b) => {
    const diff = +effectiveDue(a, now) - +effectiveDue(b, now);
    if (diff !== 0) return diff;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return remainingMin(b) - remainingMin(a);
  });
  for (const item of byDeadline) place(item, effectiveDue(item, now));

  // Pass 2 — park the overflow wherever it fits, flagged as past-deadline.
  for (const item of byDeadline) {
    if ((outstanding.get(item.id) ?? 0) > EPS) place(item, null);
  }

  const risks: Risk[] = [];
  for (const item of byDeadline) {
    const total = remainingMin(item);
    const shortfall = outstanding.get(item.id) ?? 0;
    const scheduledLate = blocks
      .filter((b) => b.itemId === item.id && b.late)
      .reduce((sum, b) => sum + b.minutes, 0);
    const missing = shortfall + scheduledLate;
    if (missing > 0) {
      risks.push({ itemId: item.id, shortfallMin: missing, level: 'at-risk' });
    } else {
      // Everything fits, but with less than 25% wiggle room before the deadline.
      const slack = mins(now, effectiveDue(item, now)) - total;
      if (slack < total * 0.25) risks.push({ itemId: item.id, shortfallMin: 0, level: 'tight' });
    }
  }

  blocks.sort((a, b) => a.start.localeCompare(b.start));

  const loadByDay: Record<string, number> = {};
  const capacityByDay: Record<string, number> = {};
  for (const day of days) {
    loadByDay[day.key] = 0;
    capacityByDay[day.key] = s.daysOff.includes(day.date.getDay()) ? 0 : s.dailyCapacityMin;
  }
  for (const b of [...blocks, ...kept.filter((k) => k.status === 'done')]) {
    const k = dayKey(b.start);
    if (k in loadByDay) loadByDay[k] += b.minutes;
  }

  return { blocks: [...kept, ...blocks], risks, loadByDay, capacityByDay, plannedAt: iso(now) };
}

/**
 * Anything you were supposed to have done by now and didn't becomes `missed`.
 * The work itself doesn't disappear — `progressMin` never moved — so the next
 * `plan()` call automatically pulls it forward. That's the whole replan story.
 */
export function markMissed(blocks: Block[], now = new Date()): { blocks: Block[]; missed: number } {
  let missed = 0;
  const out = blocks.map((b) => {
    if (b.status === 'planned' && d(b.end) < now) {
      missed++;
      return { ...b, status: 'missed' as const };
    }
    return b;
  });
  return { blocks: out, missed };
}

/** The single block the "Do" screen should point at right now. */
export function nextBlock(blocks: Block[], now = new Date()): Block | undefined {
  const live = blocks.filter((b) => b.status === 'planned');
  const active = live.find((b) => d(b.start) <= now && d(b.end) > now);
  if (active) return active;
  return live.filter((b) => d(b.start) >= now).sort((a, b) => a.start.localeCompare(b.start))[0];
}
