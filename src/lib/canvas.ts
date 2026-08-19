import type { Course, Item } from './types';
import { estimateMinutes, guessPriority } from './estimate';
import { stableId } from './id';
import { iso } from './time';
import type { ParsedFeed } from './ics';

interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
}
interface CanvasAssignment {
  id: number;
  name: string;
  due_at: string | null;
  html_url?: string;
  description?: string;
  points_possible?: number | null;
  submission_types?: string[];
  has_submitted_submissions?: boolean;
  submission?: { workflow_state?: string; submitted_at?: string | null };
}

async function api<T>(host: string, token: string, path: string): Promise<T> {
  const qs = new URLSearchParams({ host, token, path });
  const res = await fetch(`/api/canvas?${qs}`);
  const text = await res.text();
  if (!res.ok) {
    let message = `Canvas request failed (${res.status}).`;
    try {
      message = JSON.parse(text).error ?? message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return JSON.parse(text) as T;
}

const stripHtml = (s?: string) =>
  s
    ? s
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400)
    : undefined;

/**
 * Pulls active courses and their assignments straight from the Canvas REST API.
 * Richer than the .ics export — we get submission state (so already-handed-in
 * work lands as done) and points, which feeds the priority guess.
 */
export async function importCanvas(
  host: string,
  token: string,
  sourceId: string,
  now = new Date()
): Promise<ParsedFeed> {
  const warnings: string[] = [];
  const raw = await api<CanvasCourse[]>(
    host,
    token,
    'courses?enrollment_state=active&enrollment_type=student&per_page=100'
  );
  const active = raw.filter((c) => c && c.name);
  if (!active.length) throw new Error('Canvas returned no active courses for this token.');

  const courses: Course[] = active.map((c, index) => ({
    id: stableId('crs', sourceId, String(c.id)),
    sourceId,
    name: c.course_code || c.name,
    code: c.course_code,
    hue: index,
  }));

  const items: Item[] = [];

  const results = await Promise.allSettled(
    active.map((c) =>
      api<CanvasAssignment[]>(
        host,
        token,
        `courses/${c.id}/assignments?per_page=100&order_by=due_at&include[]=submission`
      ).then((list) => ({ course: c, list }))
    )
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      warnings.push(`One course failed to import: ${result.reason?.message ?? 'unknown error'}`);
      continue;
    }
    const { course, list } = result.value;
    const courseId = stableId('crs', sourceId, String(course.id));

    for (const a of list) {
      if (!a?.name) continue;
      const submitted = a.submission?.workflow_state === 'graded' || Boolean(a.submission?.submitted_at);
      const isExam = /\b(exam|midterm|final|quiz|test)\b/i.test(a.name);
      const kind = isExam ? 'exam' : 'assignment';
      const heavy = (a.points_possible ?? 0) >= 100;

      items.push({
        id: stableId('itm', sourceId, `canvas-${a.id}`),
        sourceId,
        courseId,
        kind,
        title: a.name,
        notes: stripHtml(a.description),
        url: a.html_url,
        due: a.due_at ?? undefined,
        estimateMin: Math.round(estimateMinutes(a.name, kind) * (heavy ? 1.5 : 1)),
        progressMin: 0,
        status: submitted ? 'done' : 'todo',
        priority: heavy ? 3 : guessPriority(a.name, kind),
        externalId: `canvas-${a.id}`,
        createdAt: iso(now),
        updatedAt: iso(now),
      });
    }
  }

  // Assignments with no due date can't be scheduled; keep them out of the plan.
  const dated = items.filter((i) => i.due || i.status === 'done');
  const undated = items.length - dated.length;
  if (undated > 0)
    warnings.push(`${undated} assignment${undated === 1 ? '' : 's'} had no due date and were skipped.`);

  return { items: dated, courses, warnings };
}
