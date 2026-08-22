import type { Block, Course, Item } from './types';
import { addDays, d, dayKey, startOfDay } from './time';

/**
 * Everything the Analyze page reads, derived in one pass from the two records
 * the app already keeps: finished blocks (what you actually sat down for) and
 * finished items (what got shipped). Pure, so it stays testable and the view
 * can stay presentation.
 */

/** How far back a report looks. `all` reaches the first block ever logged. */
export type Range = 7 | 30 | 90 | 'all';

export interface DayStat {
  key: string;
  date: Date;
  /** Minutes on blocks you finished. */
  focusMin: number;
  /** Minutes on blocks that came and went. */
  missedMin: number;
  done: number;
  missed: number;
}

export interface CompletedTask {
  item: Item;
  course?: Course;
  /** When it was finished. Older records only have `updatedAt` to go on. */
  at: Date;
  loggedMin: number;
  estimateMin: number;
  /** Null when the task never had a deadline to be late for. */
  onTime: boolean | null;
}

export interface CourseTotal {
  id: string;
  name: string;
  hue?: number;
  minutes: number;
}

export interface Report {
  from: Date;
  to: Date;
  days: DayStat[];
  focusMin: number;
  /** The same span, one span earlier — what the deltas compare against. */
  prevFocusMin: number;
  completed: CompletedTask[];
  prevCompletedCount: number;
  blocksDone: number;
  blocksMissed: number;
  /** Share of due blocks you actually finished, 0–1. Null before any are due. */
  followThrough: number | null;
  /** Consecutive days ending today (or yesterday) with focus logged. */
  streak: number;
  bestStreak: number;
  byCourse: CourseTotal[];
  /** Average focus per calendar weekday, index 0 = Sunday. */
  byWeekday: number[];
  /** Median logged ÷ estimated across finished tasks. Null under 3 samples. */
  estimateBias: number | null;
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

const median = (ns: number[]) => {
  const s = [...ns].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** The first day with anything on it, so `all` doesn't chart empty months. */
function earliest(blocks: Block[], items: Item[], now: Date): Date {
  const stamps = [
    ...blocks.filter((b) => b.status !== 'planned').map((b) => +d(b.start)),
    ...items.filter((i) => i.status === 'done').map((i) => +d(i.completedAt ?? i.updatedAt)),
  ];
  return stamps.length ? startOfDay(new Date(Math.min(...stamps))) : startOfDay(now);
}

export function buildReport({
  items,
  blocks,
  courses,
  range,
  now = new Date(),
}: {
  items: Item[];
  blocks: Block[];
  courses: Course[];
  range: Range;
  now?: Date;
}): Report {
  const today = startOfDay(now);
  const from = range === 'all' ? earliest(blocks, items, now) : addDays(today, -(range - 1));
  const span = Math.max(1, Math.round((+today - +from) / 86_400_000) + 1);
  const prevFrom = addDays(from, -span);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // One empty row per day in the window, so gaps read as gaps rather than
  // collapsing the axis into "days I happened to work".
  const days: DayStat[] = Array.from({ length: span }, (_, n) => {
    const date = addDays(from, n);
    return { key: dayKey(date), date, focusMin: 0, missedMin: 0, done: 0, missed: 0 };
  });
  const byKey = new Map(days.map((day) => [day.key, day]));

  let prevFocusMin = 0;
  let blocksDone = 0;
  let blocksMissed = 0;
  const courseMin = new Map<string, number>();

  for (const b of blocks) {
    if (b.status === 'planned') continue;
    const at = d(b.start);
    const day = byKey.get(dayKey(at));
    if (!day) {
      if (b.status === 'done' && at >= prevFrom && at < from) prevFocusMin += b.minutes;
      continue;
    }
    if (b.status === 'done') {
      day.focusMin += b.minutes;
      day.done++;
      blocksDone++;
      const courseId = itemById.get(b.itemId)?.courseId ?? '';
      courseMin.set(courseId, (courseMin.get(courseId) ?? 0) + b.minutes);
    } else {
      day.missedMin += b.minutes;
      day.missed++;
      blocksMissed++;
    }
  }

  const completed: CompletedTask[] = [];
  let prevCompletedCount = 0;
  for (const item of items) {
    if (item.status !== 'done') continue;
    const at = d(item.completedAt ?? item.updatedAt);
    if (at >= prevFrom && at < from) prevCompletedCount++;
    if (at < from) continue;
    completed.push({
      item,
      course: courseById.get(item.courseId ?? ''),
      at,
      loggedMin: item.progressMin,
      estimateMin: item.estimateMin,
      onTime: item.due ? at <= d(item.due) : null,
    });
  }
  completed.sort((a, b) => +b.at - +a.at);

  // Weekday rhythm is an average, not a total: five Mondays and four Tuesdays
  // in the window would otherwise make Monday look like your best day.
  const weekdayTotal = Array(7).fill(0) as number[];
  const weekdayDays = Array(7).fill(0) as number[];
  for (const day of days) {
    weekdayTotal[day.date.getDay()] += day.focusMin;
    weekdayDays[day.date.getDay()]++;
  }

  // Counted back from today so the number means "still going", and today not
  // having started yet doesn't read as a broken streak.
  const logged = new Set(days.filter((day) => day.focusMin > 0).map((day) => day.key));
  let streak = 0;
  for (let n = logged.has(dayKey(today)) ? 0 : 1; ; n++) {
    if (!logged.has(dayKey(addDays(today, -n)))) break;
    streak++;
  }
  let bestStreak = 0;
  let run = 0;
  for (const day of days) {
    run = day.focusMin > 0 ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }

  const ratios = completed
    .filter((c) => c.estimateMin > 0 && c.loggedMin > 0)
    .map((c) => c.loggedMin / c.estimateMin);

  const byCourse: CourseTotal[] = [...courseMin.entries()]
    .map(([id, minutes]) => {
      const course = courseById.get(id);
      return { id, name: course?.name ?? 'No course', hue: course?.hue, minutes };
    })
    .sort((a, b) => b.minutes - a.minutes);

  return {
    from,
    to: today,
    days,
    focusMin: sum(days.map((day) => day.focusMin)),
    prevFocusMin,
    completed,
    prevCompletedCount,
    blocksDone,
    blocksMissed,
    followThrough: blocksDone + blocksMissed > 0 ? blocksDone / (blocksDone + blocksMissed) : null,
    streak,
    bestStreak,
    byCourse,
    byWeekday: weekdayTotal.map((total, i) => (weekdayDays[i] ? total / weekdayDays[i] : 0)),
    estimateBias: ratios.length >= 3 ? median(ratios) : null,
  };
}

/**
 * Collapses the daily rows into weeks once a window is too long to read one
 * column per day. Columns stay thick enough to aim at, which is the whole
 * reason the chart is a chart.
 */
export function toColumns(days: DayStat[]): Array<DayStat & { label: string; span: number }> {
  if (days.length <= 31) {
    return days.map((day) => ({ ...day, label: `${day.date.getDate()}`, span: 1 }));
  }
  const weeks: Array<DayStat & { label: string; span: number }> = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    const first = chunk[0];
    weeks.push({
      ...first,
      focusMin: sum(chunk.map((c) => c.focusMin)),
      missedMin: sum(chunk.map((c) => c.missedMin)),
      done: sum(chunk.map((c) => c.done)),
      missed: sum(chunk.map((c) => c.missed)),
      label: `${first.date.getMonth() + 1}/${first.date.getDate()}`,
      span: chunk.length,
    });
  }
  return weeks;
}
