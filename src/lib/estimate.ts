import type { ItemKind } from './types';

/**
 * Imported assignments almost never carry an effort estimate, but the planner
 * needs one to schedule anything. We guess from the title, then let the user
 * correct it — a wrong-but-close number beats asking for input on 40 items.
 */
const RULES: Array<{ re: RegExp; minutes: number; kind?: ItemKind }> = [
  { re: /\b(final|midterm)\s*(exam|paper|project)?\b/i, minutes: 300 },
  { re: /\b(exam|test)\b/i, minutes: 240 },
  { re: /\b(term|research)\s*paper\b/i, minutes: 300 },
  { re: /\b(essay|paper|writing|memo|report)\b/i, minutes: 180 },
  { re: /\b(project|presentation|portfolio|poster)\b/i, minutes: 240 },
  { re: /\b(problem\s*set|pset|homework|hw)\b/i, minutes: 120 },
  { re: /\b(lab|studio)\b/i, minutes: 90 },
  { re: /\b(quiz)\b/i, minutes: 45 },
  { re: /\b(discussion|forum|post|reply|response)\b/i, minutes: 30 },
  { re: /\b(read|reading|chapter|ch\.?\s*\d+)\b/i, minutes: 60 },
  { re: /\b(worksheet|exercise|practice)\b/i, minutes: 60 },
  { re: /\b(survey|form|sign[\s-]?up|attendance|evaluation)\b/i, minutes: 10 },
];

const DEFAULTS: Record<ItemKind, number> = {
  assignment: 90,
  exam: 240, // study time, not the sitting itself
  task: 45,
  class: 0,
  event: 0,
};

export function estimateMinutes(title: string, kind: ItemKind): number {
  if (kind === 'class' || kind === 'event') return 0;
  const hit = RULES.find((r) => r.re.test(title));
  if (hit) return hit.minutes;
  return DEFAULTS[kind];
}

/** Exams and finals matter more than a discussion post; nudge them up front. */
export function guessPriority(title: string, kind: ItemKind): 1 | 2 | 3 {
  if (kind === 'exam') return 3;
  if (/\b(final|midterm|exam|project|thesis)\b/i.test(title)) return 3;
  if (/\b(discussion|survey|attendance|sign[\s-]?up|optional|extra\s*credit)\b/i.test(title)) return 1;
  return 2;
}

export function classifyKind(title: string, hasDuration: boolean): ItemKind {
  if (/\b(exam|midterm|final|quiz|test)\b/i.test(title)) return 'exam';
  if (hasDuration)
    return /\b(lecture|lab|section|seminar|discussion|class|recitation)\b/i.test(title) ? 'class' : 'event';
  return 'assignment';
}
