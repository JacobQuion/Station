import ICAL from 'ical.js';
import type { Course, Item } from './types';
import { classifyKind, estimateMinutes, guessPriority } from './estimate';
import { stableId } from './id';
import { addDays, iso } from './time';

export interface ParsedFeed {
  items: Item[];
  courses: Course[];
  warnings: string[];
}

/**
 * Canvas, Blackboard, Moodle and Google Calendar all title their exports like
 * "Essay 2 [ENGL 210]" or "ENGL 210: Lecture". Pulling the course out lets the
 * dashboard group and colour things properly.
 */
function splitCourse(summary: string): { title: string; course?: string } {
  const bracket = summary.match(/^(.*?)\s*[[(]([^[\]()]{2,60})[\])]\s*$/);
  if (bracket) return { title: bracket[1].trim(), course: bracket[2].trim() };

  const prefix = summary.match(/^([A-Z]{2,5}[\s-]?\d{2,4}[A-Z]?)\s*[:\-–]\s*(.+)$/);
  if (prefix) return { title: prefix[2].trim(), course: prefix[1].trim() };

  return { title: summary.trim() };
}

/**
 * A zero-length or all-day event is ambiguous: Canvas encodes "assignment due"
 * that way, but so does every holiday and birthday calendar. Guessing wrong
 * means inventing hours of homework for Labor Day, so we require actual
 * evidence — an LMS-shaped UID, a link into an assignment, or an LMS feed —
 * before treating a dateless event as work.
 */
const LMS_PRODID =
  /instructure|canvas|moodle|blackboard|desire2learn|brightspace|sakai|schoology|powerschool/i;
const DEADLINE_UID = /(assignment|quiz|submission|homework|due|calendar_event.*assignment)/i;
const DEADLINE_LINK = /\/(assignments|quizzes|mod\/assign|mod\/quiz|gradebook|webapps\/assignment)\b/i;

function looksLikeDeadline(uid: string, description?: string, url?: string, lmsFeed = false) {
  if (lmsFeed) return true;
  if (DEADLINE_UID.test(uid)) return true;
  const blob = `${description ?? ''} ${url ?? ''}`;
  return DEADLINE_LINK.test(blob) || /\b(due|submit|turn in|hand in)\b/i.test(description ?? '');
}

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Parses an iCalendar feed into Station items.
 *
 * The key call is duration: a zero-length event is a *deadline* (that's how
 * Canvas encodes "assignment due"), while a real span is a commitment you have
 * to physically be somewhere for. Recurring events are expanded across the
 * window so weekly lectures actually block out time.
 */
export function parseIcs(
  text: string,
  sourceId: string,
  opts: { windowDays?: number; now?: Date } = {}
): ParsedFeed {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 120;
  const from = addDays(now, -14);
  const to = addDays(now, windowDays);
  const warnings: string[] = [];

  let comp: ICAL.Component;
  try {
    comp = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new Error("That doesn't look like a calendar feed. Check the URL — it should end in .ics.");
  }

  const vevents = comp.getAllSubcomponents('vevent');
  if (!vevents.length) throw new Error('The feed parsed, but contained no events.');

  const prodId = String(comp.getFirstPropertyValue('prodid') ?? '');
  const lmsFeed = LMS_PRODID.test(prodId);

  const courses = new Map<string, Course>();
  const items = new Map<string, Item>();

  const courseIdFor = (name?: string) => {
    if (!name) return undefined;
    const id = stableId('crs', sourceId, name.toLowerCase());
    if (!courses.has(id)) {
      courses.set(id, {
        id,
        sourceId,
        name,
        code: /^[A-Z]{2,5}[\s-]?\d/.test(name) ? name : undefined,
        hue: courses.size,
      });
    }
    return id;
  };

  const add = (summary: string, start: Date, end: Date, uid: string, description?: string, url?: string) => {
    const { title, course } = splitCourse(summary || 'Untitled');
    const durationMin = Math.round((+end - +start) / 60_000);
    const allDay = durationMin >= 1439 && start.getHours() === 0;
    const hasDuration = durationMin > 0 && durationMin < 1439;
    const deadlineish = hasDuration || looksLikeDeadline(uid, description, url, lmsFeed);
    // Not a commitment and not evidently a deadline — a holiday, a birthday,
    // a term marker. Keep it visible on the calendar, but schedule no work.
    const kind = deadlineish ? classifyKind(title, hasDuration) : 'event';

    const id = stableId('itm', sourceId, uid, iso(start));
    const base = {
      id,
      sourceId,
      courseId: courseIdFor(course),
      title,
      notes: description ? stripHtml(description).slice(0, 500) : undefined,
      url,
      externalId: uid,
      status: 'todo' as const,
      progressMin: 0,
      priority: guessPriority(title, kind),
      createdAt: iso(now),
      updatedAt: iso(now),
    };

    items.set(
      id,
      hasDuration || kind === 'exam' || kind === 'event'
        ? {
            ...base,
            kind,
            start: iso(start),
            end: iso(hasDuration || allDay ? end : new Date(+start + 90 * 60_000)),
            due: kind === 'exam' ? iso(start) : undefined,
            estimateMin: kind === 'exam' ? estimateMinutes(title, 'exam') : 0,
            allDay: allDay || undefined,
          }
        : {
            ...base,
            kind: 'assignment',
            // An all-day deadline really means "by end of that day".
            due: iso(allDay ? new Date(+start + 23 * 60 * 60_000 + 59 * 60_000) : start),
            estimateMin: estimateMinutes(title, 'assignment'),
          }
    );
  };

  for (const ve of vevents) {
    try {
      const event = new ICAL.Event(ve);
      const summary = event.summary || ve.getFirstPropertyValue('summary')?.toString() || 'Untitled';
      const description = ve.getFirstPropertyValue('description')?.toString();
      const url = ve.getFirstPropertyValue('url')?.toString();
      const uid = event.uid || stableId('uid', summary);

      if (event.isRecurring()) {
        const it = event.iterator();
        let next: ICAL.Time | null;
        let guard = 0;
        while ((next = it.next()) && guard++ < 400) {
          const at = next.toJSDate();
          if (at > to) break;
          if (at < from) continue;
          const details = event.getOccurrenceDetails(next);
          add(
            summary,
            details.startDate.toJSDate(),
            details.endDate.toJSDate(),
            `${uid}@${at.getTime()}`,
            description,
            url
          );
        }
      } else {
        const start = event.startDate?.toJSDate();
        if (!start) continue;
        const end = event.endDate?.toJSDate() ?? start;
        if (start > to || end < from) continue;
        add(summary, start, end, uid, description, url);
      }
    } catch (err) {
      warnings.push(`Skipped an event: ${(err as Error).message}`);
    }
  }

  return { items: [...items.values()], courses: [...courses.values()], warnings };
}

/** Turns a webcal:// or Google "secret address" link into something fetchable. */
export function normalizeFeedUrl(raw: string) {
  return raw.trim().replace(/^webcal:\/\//i, 'https://');
}

export async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(`/api/fetch?url=${encodeURIComponent(normalizeFeedUrl(url))}`);
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = JSON.parse(text).error ?? text;
    } catch {
      /* plain text error */
    }
    throw new Error(message);
  }
  return text;
}
