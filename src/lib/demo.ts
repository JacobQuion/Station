import type { Course, Item } from './types';
import { addDays, iso, startOfDay } from './time';
import { stableId } from './id';
import { estimateMinutes, guessPriority } from './estimate';

const at = (base: Date, dayOffset: number, hour: number, minute = 0) => {
  const t = startOfDay(addDays(base, dayOffset));
  t.setHours(hour, minute, 0, 0);
  return t;
};

/**
 * A realistic mid-semester week: recurring lectures, a pile-up of deadlines,
 * and one exam close enough to be uncomfortable. Enough friction that the
 * planner visibly has to make choices.
 */
export function buildDemo(sourceId: string, now = new Date()): { items: Item[]; courses: Course[] } {
  const defs = [
    { key: 'cs', name: 'CS 214', full: 'Data Structures' },
    { key: 'engl', name: 'ENGL 210', full: 'Rhetoric & Argument' },
    { key: 'bio', name: 'BIO 150', full: 'Cell Biology' },
    { key: 'stat', name: 'STAT 118', full: 'Applied Statistics' },
  ];

  const courses: Course[] = defs.map((c, hue) => ({
    id: stableId('crs', sourceId, c.key),
    sourceId,
    name: c.name,
    code: c.full,
    hue,
  }));
  const cid = (key: string) => stableId('crs', sourceId, key);

  const items: Item[] = [];
  let seq = 0;

  const push = (partial: Partial<Item> & Pick<Item, 'kind' | 'title'> & { courseKey: string }) => {
    const { courseKey, ...rest } = partial;
    const estimate = rest.estimateMin ?? estimateMinutes(rest.title, rest.kind);
    items.push({
      id: stableId('itm', sourceId, `demo-${seq++}`),
      sourceId,
      courseId: cid(courseKey),
      notes: undefined,
      progressMin: 0,
      status: 'todo',
      priority: rest.priority ?? guessPriority(rest.title, rest.kind),
      estimateMin: estimate,
      createdAt: iso(now),
      updatedAt: iso(now),
      ...rest,
    } as Item);
  };

  // Recurring classes across the next three weeks.
  const schedule: Array<{ courseKey: string; title: string; days: number[]; hour: number; minutes: number }> =
    [
      { courseKey: 'cs', title: 'CS 214 Lecture', days: [1, 3], hour: 10, minutes: 75 },
      { courseKey: 'cs', title: 'CS 214 Lab', days: [5], hour: 14, minutes: 110 },
      { courseKey: 'engl', title: 'ENGL 210 Seminar', days: [2, 4], hour: 13, minutes: 80 },
      { courseKey: 'bio', title: 'BIO 150 Lecture', days: [1, 3, 5], hour: 9, minutes: 50 },
      { courseKey: 'stat', title: 'STAT 118 Lecture', days: [2, 4], hour: 11, minutes: 75 },
    ];

  for (let offset = 0; offset < 21; offset++) {
    const day = addDays(now, offset);
    for (const s of schedule) {
      if (!s.days.includes(day.getDay())) continue;
      const start = at(now, offset, s.hour);
      if (start < now) continue;
      push({
        courseKey: s.courseKey,
        kind: 'class',
        title: s.title,
        start: iso(start),
        end: iso(new Date(+start + s.minutes * 60_000)),
        estimateMin: 0,
        priority: 2,
      });
    }
  }

  push({
    courseKey: 'cs',
    kind: 'assignment',
    title: 'Problem Set 4: Balanced Trees',
    due: iso(at(now, 1, 23, 59)),
  });
  push({
    courseKey: 'bio',
    kind: 'assignment',
    title: 'Lab Report: Mitosis Observation',
    due: iso(at(now, 2, 17)),
  });
  push({
    courseKey: 'engl',
    kind: 'assignment',
    title: 'Essay 2 Draft: Counterargument',
    due: iso(at(now, 3, 23, 59)),
  });
  push({
    courseKey: 'stat',
    kind: 'assignment',
    title: 'Homework 6: Confidence Intervals',
    due: iso(at(now, 4, 23, 59)),
  });
  push({
    courseKey: 'engl',
    kind: 'assignment',
    title: 'Discussion Post: Week 7 Reading',
    due: iso(at(now, 1, 12)),
  });
  push({
    courseKey: 'bio',
    kind: 'assignment',
    title: 'Reading: Chapter 12 — Signaling',
    due: iso(at(now, 5, 9)),
  });
  push({
    courseKey: 'cs',
    kind: 'assignment',
    title: 'Project Milestone 1: API Design',
    due: iso(at(now, 8, 23, 59)),
  });
  push({
    courseKey: 'stat',
    kind: 'assignment',
    title: 'Homework 7: Hypothesis Testing',
    due: iso(at(now, 11, 23, 59)),
  });
  push({ courseKey: 'engl', kind: 'assignment', title: 'Essay 2 Final', due: iso(at(now, 12, 23, 59)) });

  // A deliberately tiny task, so the timer (and its one-minute warning) can be
  // seen end to end without waiting out a real block. 1m 3s.
  push({
    courseKey: 'cs',
    kind: 'task',
    title: 'Sample: one-minute timer check',
    due: iso(new Date(+now + 4 * 60 * 60_000)),
    estimateMin: 1.05,
    priority: 2,
  });

  // Same idea, exactly one minute — the timer goes red the moment it starts.
  push({
    courseKey: 'cs',
    kind: 'task',
    title: 'Dummy: one-minute task',
    due: iso(new Date(+now + 5 * 60 * 60_000)),
    estimateMin: 1,
    priority: 2,
  });

  const examStart = at(now, 6, 15);
  push({
    courseKey: 'stat',
    kind: 'exam',
    title: 'STAT 118 Midterm',
    start: iso(examStart),
    end: iso(new Date(+examStart + 120 * 60_000)),
    due: iso(examStart),
    estimateMin: 300,
    priority: 3,
  });

  const bioExam = at(now, 13, 10);
  push({
    courseKey: 'bio',
    kind: 'exam',
    title: 'BIO 150 Midterm 2',
    start: iso(bioExam),
    end: iso(new Date(+bioExam + 90 * 60_000)),
    due: iso(bioExam),
    estimateMin: 240,
    priority: 3,
  });

  return { items, courses };
}
