/**
 * Exercises the planner end-to-end against the demo semester.
 * Run: npm run test
 */
import { buildDemo } from '../src/lib/demo';
import { plan, markMissed, nextBlock, remainingMin, isWorkable, isCommitment } from '../src/lib/planner';
import { DEFAULT_SETTINGS } from '../src/store/useStation';
import { parseIcs } from '../src/lib/ics';
import type { Block, Item } from '../src/lib/types';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const mins = (bs: Block[]) => bs.reduce((s, b) => s + b.minutes, 0);

const now = new Date('2026-03-02T08:00:00'); // a Monday morning
const { items } = buildDemo('src_demo', now);
const settings = { ...DEFAULT_SETTINGS };

console.log('\n── plan() on a full demo semester ───────────────────────────');
const result = plan({ items, settings, now });
const planned = result.blocks.filter((b) => b.status === 'planned');
const work = items.filter(isWorkable);

check('produces a schedule', planned.length > 0, `${planned.length} blocks`);
check(
  'schedules every workable item',
  work.every((i) => planned.some((b) => b.itemId === i.id)),
  `${work.length} items needing work`
);

// No block may overlap another block.
const sorted = [...planned].sort((a, b) => a.start.localeCompare(b.start));
const blockOverlap = sorted.some((b, i) => i > 0 && b.start < sorted[i - 1].end);
check('no two work blocks overlap', !blockOverlap);

// No block may collide with a class, lab or exam.
const fixed = items.filter((i) => i.start && i.end && i.kind !== 'assignment');
const clash = planned.find((b) => fixed.some((f) => b.start < f.end! && f.start! < b.end));
check('never schedules over a class or exam', !clash, clash ? `${clash.start} collides` : '');

// Respect the working window.
const outsideHours = planned.filter((b) => {
  const s = new Date(b.start);
  const e = new Date(b.end);
  const sm = s.getHours() * 60 + s.getMinutes();
  const em = e.getHours() * 60 + e.getMinutes();
  return sm < settings.dayStartMin || em > settings.dayEndMin;
});
check('stays inside working hours', outsideHours.length === 0, `${outsideHours.length} strays`);

// Respect the daily capacity ceiling.
const localDay = (v: string) => {
  const t = new Date(v);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const perDay = new Map<string, number>();
for (const b of planned) {
  const k = localDay(b.start);
  perDay.set(k, (perDay.get(k) ?? 0) + b.minutes);
}
const overCap = [...perDay.entries()].filter(([, m]) => m > settings.dailyCapacityMin);
check(
  'honours the daily capacity cap',
  overCap.length === 0,
  overCap.map(([k, m]) => `${k}=${m}m`).join(' ')
);

// Block sizes are sane. A block may fall below the minimum only when it is the
// item's final tail — otherwise the planner is shredding work into fragments.
check(
  'no block exceeds the focus limit',
  planned.every((b) => b.minutes <= settings.focusMin)
);
const shredded = work.filter((i) => {
  const own = planned.filter((b) => b.itemId === i.id).sort((a, b) => a.start.localeCompare(b.start));
  return own.slice(0, -1).some((b) => b.minutes < settings.minBlockMin);
});
check(
  'short blocks only ever finish an item off',
  shredded.length === 0,
  shredded.map((i) => i.title).join(', ')
);

// Total scheduled time must not exceed the total work outstanding.
const totalNeeded = work.reduce((s, i) => s + remainingMin(i), 0);
check(
  'never over-schedules an item',
  work.every((i) => {
    const got = mins(planned.filter((b) => b.itemId === i.id));
    return got <= remainingMin(i) + settings.focusMin;
  }),
  `${totalNeeded}m of work total`
);

// Deadline ordering: the first block of a sooner-due item should not start
// after every block of a later-due item with comparable priority.
const psetFirst = planned.find((b) => items.find((i) => i.id === b.itemId)?.title.includes('Problem Set 4'));
const essayFinal = planned.find((b) => items.find((i) => i.id === b.itemId)?.title.includes('Essay 2 Final'));
check(
  'urgent work is scheduled before distant work',
  Boolean(psetFirst && essayFinal && psetFirst.start < essayFinal.start),
  psetFirst && essayFinal ? `${psetFirst.start.slice(5, 16)} < ${essayFinal.start.slice(5, 16)}` : 'missing'
);

console.log('\n── nextBlock() ──────────────────────────────────────────────');
const next = nextBlock(result.blocks, now);
check('always has a next thing', Boolean(next), next ? items.find((i) => i.id === next.itemId)?.title : '');

console.log('\n── falling behind and replanning ────────────────────────────');
// Fast-forward two days without doing anything.
const later = new Date('2026-03-04T08:00:00');
const { blocks: swept, missed } = markMissed(result.blocks, later);
check('missed blocks are detected', missed > 0, `${missed} blocks blown`);

const history = swept.filter((b) => b.status !== 'planned');
const replanned = plan({ items, settings, now: later, history });
const rePlanned = replanned.blocks.filter((b) => b.status === 'planned');

check('replan produces a fresh forward schedule', rePlanned.length > 0, `${rePlanned.length} blocks`);
check(
  'replan keeps the missed history',
  replanned.blocks.filter((b) => b.status === 'missed').length === missed
);
check(
  'every replanned block is in the future',
  rePlanned.every((b) => new Date(b.start) >= later)
);
check(
  'missed work was not lost',
  work.filter((i) => i.due && new Date(i.due) > later).every((i) => rePlanned.some((b) => b.itemId === i.id))
);

// Deadlines that passed while we did nothing must now be flagged.
const risks = replanned.risks.filter((r) => r.level === 'at-risk');
check(
  'impossible work is flagged, not hidden',
  risks.length > 0,
  `${risks.length} at risk: ` +
    risks
      .slice(0, 3)
      .map((r) => items.find((i) => i.id === r.itemId)?.title)
      .join(', ')
);

console.log('\n── progress reduces future scheduling ───────────────────────');
const target = work.find((i) => i.title.includes('Essay 2 Draft'))!;
const advanced: Item[] = items.map((i) =>
  i.id === target.id ? { ...i, progressMin: i.estimateMin - 30 } : i
);
const after = plan({ items: advanced, settings, now });
const before = mins(result.blocks.filter((b) => b.itemId === target.id && b.status === 'planned'));
const now2 = mins(after.blocks.filter((b) => b.itemId === target.id && b.status === 'planned'));
check('logged progress shrinks remaining blocks', now2 < before, `${before}m → ${now2}m`);

const finished: Item[] = items.map((i) => (i.id === target.id ? { ...i, status: 'done' as const } : i));
const afterDone = plan({ items: finished, settings, now });
check(
  'finished work disappears from the plan',
  !afterDone.blocks.some((b) => b.itemId === target.id && b.status === 'planned')
);

console.log('\n── capacity pressure ────────────────────────────────────────');
const tight = plan({ items, settings: { ...settings, dailyCapacityMin: 60 }, now });
check(
  'a squeezed day flags more risk',
  tight.risks.filter((r) => r.level === 'at-risk').length >=
    result.risks.filter((r) => r.level === 'at-risk').length,
  `${tight.risks.filter((r) => r.level === 'at-risk').length} vs ${result.risks.filter((r) => r.level === 'at-risk').length}`
);

const weekend = plan({ items, settings: { ...settings, daysOff: [0, 6] }, now });
check(
  'days off are respected',
  !weekend.blocks
    .filter((b) => b.status === 'planned')
    .some((b) => [0, 6].includes(new Date(b.start).getDay()))
);

console.log('\n── ICS import ───────────────────────────────────────────────');
const ics = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Instructure//Canvas//EN',
  'BEGIN:VEVENT',
  'UID:event-assignment-991',
  'DTSTAMP:20260301T120000Z',
  'DTSTART;VALUE=DATE:20260310',
  'SUMMARY:Problem Set 5 [MATH 221]',
  'DESCRIPTION:<p>Submit on Canvas</p>',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-lecture-1',
  'DTSTAMP:20260301T120000Z',
  'DTSTART;TZID=America/New_York:20260303T100000',
  'DTEND;TZID=America/New_York:20260303T111500',
  'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=8',
  'SUMMARY:MATH 221: Lecture',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-exam-7',
  'DTSTAMP:20260301T120000Z',
  'DTSTART;TZID=America/New_York:20260320T140000',
  'DTEND;TZID=America/New_York:20260320T160000',
  'SUMMARY:Midterm Exam [MATH 221]',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const feed = parseIcs(ics, 'src_test', { now: new Date('2026-03-01T09:00:00') });
check('parses a Canvas-style feed', feed.items.length > 0, `${feed.items.length} items`);
check(
  'expands recurring lectures',
  feed.items.filter((i) => i.kind === 'class').length === 8,
  `${feed.items.filter((i) => i.kind === 'class').length} lectures`
);
check(
  'a zero-length event becomes a deadline',
  feed.items.some((i) => i.kind === 'assignment' && i.title === 'Problem Set 5' && Boolean(i.due))
);
check(
  'extracts the course from the title',
  feed.courses.some((c) => c.name === 'MATH 221'),
  feed.courses.map((c) => c.name).join(', ')
);
check(
  'detects the exam and gives it study time',
  feed.items.some((i) => i.kind === 'exam' && i.estimateMin > 0)
);
check(
  'estimates effort for imported work',
  feed.items.filter((i) => i.kind === 'assignment').every((i) => i.estimateMin > 0)
);
check(
  'ids are stable across re-imports',
  parseIcs(ics, 'src_test', { now: new Date('2026-03-01T09:00:00') }).items[0].id === feed.items[0].id
);

// The imported feed must be schedulable too.
const imported = plan({ items: feed.items, settings, now: new Date('2026-03-01T09:00:00') });
check('imported feed schedules cleanly', imported.blocks.length > 0, `${imported.blocks.length} blocks`);
const importClash = imported.blocks
  .filter((b) => b.status === 'planned')
  .find((b) =>
    feed.items.filter((i) => i.kind === 'class').some((f) => b.start < f.end! && f.start! < b.end)
  );
check('imported lectures block out time', !importClash);

console.log('\n── ambiguous all-day events ─────────────────────────────────');
const holidays = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Office Holidays Ltd.//EN',
  'BEGIN:VEVENT',
  'UID:abc-holiday-1',
  'DTSTAMP:20260301T120000Z',
  'DTSTART;VALUE=DATE:20260907',
  'DTEND;VALUE=DATE:20260908',
  'SUMMARY:Labor Day',
  'DESCRIPTION:Public holiday',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
const hol = parseIcs(holidays, 'src_hol', { now: new Date('2026-09-01T09:00:00') });
check(
  'a holiday is not turned into homework',
  hol.items.every((i) => i.estimateMin === 0 && i.kind !== 'assignment'),
  hol.items.map((i) => `${i.kind}:${i.estimateMin}m`).join(' ')
);
const holPlan = plan({ items: hol.items, settings, now: new Date('2026-09-01T09:00:00') });
check('a holiday schedules no work', holPlan.blocks.length === 0);
check('an all-day marker does not block out the day', !hol.items.some((i) => isCommitment(i)));

// The same shape from an LMS feed *is* a deadline.
const lms = holidays
  .replace('PRODID:-//Office Holidays Ltd.//EN', 'PRODID:-//Instructure//Canvas//EN')
  .replace('SUMMARY:Labor Day', 'SUMMARY:Reflection Essay [HIST 101]');
const lmsFeed = parseIcs(lms, 'src_lms', { now: new Date('2026-09-01T09:00:00') });
check(
  'the same shape from Canvas is still a deadline',
  lmsFeed.items.every((i) => i.kind === 'assignment' && i.estimateMin > 0 && Boolean(i.due)),
  lmsFeed.items.map((i) => `${i.kind}:${i.estimateMin}m`).join(' ')
);

console.log(`\n${failures === 0 ? '✓ all checks passed' : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures ? 1 : 0);
