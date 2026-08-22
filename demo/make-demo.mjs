/**
 * Writes demo/station-demo.ics — a mid-semester week, dated relative to the day
 * you run this. Upload it on the Import page ("Upload .ics").
 *
 *   node demo/make-demo.mjs
 *
 * Every event here exists to make one part of Station visible: the estimate
 * rules, the priority guesses, the course splitter, an overdue deadline, an
 * all-day marker that must NOT be treated as work, and enough collisions that
 * the planner has to choose. See demo/README.md for what each one proves.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const p = (n) => String(n).padStart(2, '0');
const T = new Date();
T.setHours(0, 0, 0, 0);

const day = (n) => {
  const x = new Date(T);
  x.setDate(x.getDate() + n);
  return x;
};
const at = (n, h, m = 0) => {
  const x = day(n);
  x.setHours(h, m, 0, 0);
  return x;
};
/** Floating local time, so the demo lands at sensible hours on any machine. */
const stamp = (x) =>
  `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}T${p(x.getHours())}${p(x.getMinutes())}00`;
const datestamp = (x) => `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}`;

/** Monday of the week that contains today, so the lecture series lines up. */
const toMonday = T.getDay() === 0 ? -6 : 1 - T.getDay();

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,');

/** RFC 5545 line folding: continuation lines start with one space. */
const fold = (line) => {
  const out = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ' ' + rest.slice(73);
  }
  out.push(rest);
  return out.join('\r\n');
};

const events = [];

/** A class, lab or seminar: a real span, so the planner has to route around it. */
const recurring = ({ uid, summary, dayOffset, hour, minute = 0, minutes, byday, count }) => {
  const start = at(toMonday + dayOffset, hour, minute);
  const end = new Date(+start + minutes * 60_000);
  events.push([
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(T)}Z`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byday};COUNT=${count}`,
    `SUMMARY:${esc(summary)}`,
    'END:VEVENT',
  ]);
};

/** A one-off span: office hours, a study group, an exam sitting. */
const timed = ({ uid, summary, dayOffset, hour, minute = 0, minutes, description }) => {
  const start = at(dayOffset, hour, minute);
  const end = new Date(+start + minutes * 60_000);
  events.push([
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(T)}Z`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(summary)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    'END:VEVENT',
  ]);
};

/**
 * A deadline. Zero length is how Canvas encodes "due at" — Station only treats
 * one as work when there's evidence (an LMS-shaped UID or a link into an
 * assignment), which is exactly what the UID and URL below supply.
 */
const due = ({ uid, summary, dayOffset, hour, minute = 0, course, id, description }) => {
  const start = at(dayOffset, hour, minute);
  events.push([
    'BEGIN:VEVENT',
    `UID:assignment-${uid}@canvas.demo.edu`,
    `DTSTAMP:${stamp(T)}Z`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(start)}`,
    `SUMMARY:${esc(summary)}`,
    `URL:https://canvas.demo.edu/courses/${course}/assignments/${id}`,
    `DESCRIPTION:${esc(description ?? 'Submit through Canvas before the deadline.')}`,
    'END:VEVENT',
  ]);
};

/** An all-day marker. Shown on the calendar, never treated as busy time. */
const allDay = ({ uid, summary, dayOffset, description }) => {
  events.push([
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(T)}Z`,
    `DTSTART;VALUE=DATE:${datestamp(day(dayOffset))}`,
    `DTEND;VALUE=DATE:${datestamp(day(dayOffset + 1))}`,
    `SUMMARY:${esc(summary)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    'END:VEVENT',
  ]);
};

/* ── Classes ─────────────────────────────────────────────────────────────
   "CS 214: Lecture" exercises the prefix form of the course splitter. */
recurring({ uid: 'cls-bio-lec@demo.edu', summary: 'BIO 150: Lecture', dayOffset: 0, hour: 9, minutes: 50, byday: 'MO,WE,FR', count: 18 });
recurring({ uid: 'cls-cs-lec@demo.edu', summary: 'CS 214: Lecture', dayOffset: 0, hour: 10, minutes: 75, byday: 'MO,WE', count: 12 });
recurring({ uid: 'cls-stat-lec@demo.edu', summary: 'STAT 118: Lecture', dayOffset: 1, hour: 11, minutes: 75, byday: 'TU,TH', count: 12 });
recurring({ uid: 'cls-engl-sem@demo.edu', summary: 'ENGL 210: Seminar', dayOffset: 1, hour: 13, minutes: 80, byday: 'TU,TH', count: 12 });
recurring({ uid: 'cls-cs-lab@demo.edu', summary: 'CS 214: Lab', dayOffset: 4, hour: 14, minutes: 110, byday: 'FR', count: 6 });

/* ── One-off commitments, so today's rail is never empty ─────────────── */
timed({ uid: 'evt-officehours@demo.edu', summary: 'CS 214: Office Hours', dayOffset: 0, hour: 16, minutes: 60, description: 'Bring questions about the tree rotations.' });
timed({ uid: 'evt-studygroup@demo.edu', summary: 'Study Group [BIO 150]', dayOffset: 1, hour: 18, minutes: 90, description: 'Library, room 2B.' });

/* ── Exams: a real sitting, and study time the planner front-loads ───── */
timed({ uid: 'exam-stat-mid@demo.edu', summary: 'STAT 118: Midterm 1', dayOffset: 6, hour: 15, minutes: 120, description: 'Chapters 1 to 7. One page of notes allowed.' });
timed({ uid: 'exam-bio-mid@demo.edu', summary: 'BIO 150: Midterm 2', dayOffset: 13, hour: 10, minutes: 90 });

/* ── Deadlines ───────────────────────────────────────────────────────── */
due({ uid: '4001', id: 4001, course: 210, summary: 'Discussion Post: Week 7 Reading [ENGL 210]', dayOffset: -1, hour: 18 });
due({ uid: '4013', id: 4013, course: 210, summary: 'Research Paper Outline [ENGL 210]', dayOffset: 1, hour: 12, description: 'Bring a working thesis and five sources.' });
due({ uid: '4002', id: 4002, course: 150, summary: 'Reading: Chapter 12, Cell Signaling [BIO 150]', dayOffset: 0, hour: 21 });
due({ uid: '4003', id: 4003, course: 214, summary: 'Problem Set 4: Balanced Trees [CS 214]', dayOffset: 1, hour: 23, minute: 59, description: 'Submit a PDF plus your source. Late work loses 10% a day.' });
due({ uid: '4004', id: 4004, course: 214, summary: 'Advising Sign-up [CS 214]', dayOffset: 2, hour: 12 });
due({ uid: '4005', id: 4005, course: 150, summary: 'Lab Report: Mitosis Observation [BIO 150]', dayOffset: 2, hour: 17 });
due({ uid: '4006', id: 4006, course: 210, summary: 'Essay 2 Draft: Counterargument [ENGL 210]', dayOffset: 3, hour: 23, minute: 59 });
due({ uid: '4007', id: 4007, course: 118, summary: 'Homework 6: Confidence Intervals [STAT 118]', dayOffset: 4, hour: 23, minute: 59 });
due({ uid: '4008', id: 4008, course: 118, summary: 'Quiz 5: Sampling Distributions [STAT 118]', dayOffset: 5, hour: 20, description: 'Opens in Canvas for 90 minutes.' });
due({ uid: '4009', id: 4009, course: 118, summary: 'Course Evaluation Survey [STAT 118]', dayOffset: 5, hour: 23, minute: 59 });
due({ uid: '4010', id: 4010, course: 214, summary: 'Project Milestone 1: API Design [CS 214]', dayOffset: 8, hour: 23, minute: 59 });
due({ uid: '4011', id: 4011, course: 118, summary: 'Homework 7: Hypothesis Testing [STAT 118]', dayOffset: 11, hour: 23, minute: 59 });
due({ uid: '4012', id: 4012, course: 210, summary: 'Essay 2 Revision [ENGL 210]', dayOffset: 12, hour: 23, minute: 59 });

/* ── An all-day marker that must not turn into homework ──────────────── */
allDay({ uid: 'holiday-fall-break@demo.edu', summary: 'Fall Break', dayOffset: 9, description: 'University holiday. Campus offices closed.' });

const ics = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Station//Demo Semester//EN',
  'CALSCALE:GREGORIAN',
  'X-WR-CALNAME:Fall Term (demo)',
  ...events.flat(),
  'END:VCALENDAR',
]
  .map(fold)
  .join('\r\n');

const out = join(HERE, 'station-demo.ics');
writeFileSync(out, ics + '\r\n');
console.log(`wrote ${out} — ${events.length} events, anchored to ${T.toDateString()}`);
