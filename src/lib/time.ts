import {
  startOfWeek,
  addDays,
  differenceInMinutes,
  format,
  isSameDay,
  startOfDay,
  formatDistanceToNowStrict,
  isAfter,
  isBefore,
} from 'date-fns';

export const d = (v: string | number | Date) => (v instanceof Date ? v : new Date(v));
export const iso = (v: Date) => v.toISOString();
export const dayKey = (v: string | number | Date) => format(d(v), 'yyyy-MM-dd');

export const atMinutes = (day: Date, minutes: number) =>
  new Date(startOfDay(day).getTime() + minutes * 60_000);

export const minutesOfDay = (v: Date) => v.getHours() * 60 + v.getMinutes();

export const clockLabel = (v: string | number | Date) => {
  const t = format(d(v), 'h:mm a');
  return t.replace(':00', '').toLowerCase();
};

export const rangeLabel = (a: string | Date, b: string | Date) => `${clockLabel(a)} – ${clockLabel(b)}`;

export function durationLabel(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/** "in 3 days", "in 4h", "2h overdue" — the phrasing the dashboard leans on. */
export function dueLabel(due: string | Date, now = new Date()) {
  const t = d(due);
  const mins = differenceInMinutes(t, now);
  if (mins < 0) return `${formatDistanceToNowStrict(t)} overdue`;
  if (mins < 60) return `in ${mins}m`;
  if (isSameDay(t, now)) return `today ${clockLabel(t)}`;
  if (isSameDay(t, addDays(now, 1))) return `tomorrow ${clockLabel(t)}`;
  if (mins < 60 * 24 * 7) return `${format(t, 'EEEE')} ${clockLabel(t)}`;
  return format(t, 'MMM d');
}

export function relativeDayLabel(day: Date, now = new Date()) {
  if (isSameDay(day, now)) return 'Today';
  if (isSameDay(day, addDays(now, 1))) return 'Tomorrow';
  if (differenceInMinutes(day, now) < 60 * 24 * 7) return format(day, 'EEEE');
  return format(day, 'EEE MMM d');
}

export interface Interval {
  start: Date;
  end: Date;
}

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Removes `busy` from `free`, returning the remaining gaps in order. */
export function subtract(free: Interval[], busy: Interval[]): Interval[] {
  let out = free.map((f) => ({ ...f }));
  for (const b of busy) {
    const next: Interval[] = [];
    for (const f of out) {
      if (!overlaps(f, b)) {
        next.push(f);
        continue;
      }
      if (isBefore(f.start, b.start)) next.push({ start: f.start, end: b.start });
      if (isAfter(f.end, b.end)) next.push({ start: b.end, end: f.end });
    }
    out = next;
  }
  return out.filter((i) => differenceInMinutes(i.end, i.start) > 0);
}

/** Merges overlapping/adjacent intervals so subtraction stays cheap. */
export function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => +a.start - +b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = new Date(Math.max(+last.end, +i.end));
    else out.push({ start: new Date(i.start), end: new Date(i.end) });
  }
  return out;
}

export const mins = (a: Date, b: Date) => differenceInMinutes(b, a);

/** Rounds up to the next 5-minute mark so blocks start on tidy times. */
export function roundUp5(v: Date) {
  const t = new Date(v);
  t.setSeconds(0, 0);
  const r = t.getMinutes() % 5;
  if (r) t.setMinutes(t.getMinutes() + (5 - r));
  return t;
}

/** Sunday-first, matching how the load chart reads a week. */
export const startOfCalendarWeek = (v: Date) => startOfWeek(v, { weekStartsOn: 0 });

export { addDays, startOfDay, isSameDay, format, differenceInMinutes };
