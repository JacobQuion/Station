export type ISO = string;

export type SourceKind = 'ics' | 'canvas' | 'manual' | 'demo';

export interface Source {
  id: string;
  kind: SourceKind;
  label: string;
  /** Feed URL for `ics`, `host` for `canvas`. */
  url?: string;
  /** Canvas personal access token. Stored locally only, never sent anywhere but Canvas. */
  token?: string;
  lastSyncedAt?: ISO;
  lastError?: string;
  itemCount: number;
}

export interface Course {
  id: string;
  sourceId: string;
  name: string;
  code?: string;
  /** Index into the palette, so a course keeps its colour across syncs. */
  hue: number;
}

export type ItemKind = 'assignment' | 'exam' | 'class' | 'event' | 'task';
export type ItemStatus = 'todo' | 'done' | 'archived';

export interface Item {
  id: string;
  sourceId: string;
  courseId?: string;
  kind: ItemKind;
  title: string;
  notes?: string;
  url?: string;

  /** Deadline. Present on assignment/exam/task. */
  due?: ISO;
  /** Fixed clock time. Present on class/exam/event — these are commitments, not work. */
  start?: ISO;
  end?: ISO;
  /** Spans a whole day (a holiday, a term marker). Shown, but never treated as busy time. */
  allDay?: boolean;

  /** Total work the item needs, in minutes. Estimated on import, editable. */
  estimateMin: number;
  /** Work already logged, in minutes. */
  progressMin: number;

  status: ItemStatus;
  /** 1 = low, 2 = normal, 3 = high. Nudges the effective deadline earlier. */
  priority: 1 | 2 | 3;

  /** Stable id from the origin system, so re-syncing updates instead of duplicating. */
  externalId?: string;
  createdAt: ISO;
  updatedAt: ISO;
}

export type BlockStatus = 'planned' | 'done' | 'missed';

/** A scheduled chunk of work on one item. The planner owns these. */
export interface Block {
  id: string;
  itemId: string;
  start: ISO;
  end: ISO;
  minutes: number;
  status: BlockStatus;
  /** True when the planner could only fit this after the item's deadline. */
  late?: boolean;
}

export interface Settings {
  /** Minutes from midnight. */
  dayStartMin: number;
  dayEndMin: number;
  /** Longest single focus block. */
  focusMin: number;
  /** Shortest worth-scheduling block. */
  minBlockMin: number;
  breakMin: number;
  /** Ceiling on scheduled work per day. Keeps the planner from front-loading everything. */
  dailyCapacityMin: number;
  /** 0 = Sunday. Days with no scheduled work. */
  daysOff: number[];
  /** Minutes of buffer kept around fixed commitments. */
  commuteMin: number;
  horizonDays: number;
}

export interface Risk {
  itemId: string;
  /** Minutes of work that don't fit before the deadline. */
  shortfallMin: number;
  level: 'tight' | 'at-risk';
}

export interface PlanResult {
  blocks: Block[];
  risks: Risk[];
  /** Scheduled minutes per `yyyy-MM-dd`. */
  loadByDay: Record<string, number>;
  capacityByDay: Record<string, number>;
  plannedAt: ISO;
}

export interface ReplanReport {
  missed: number;
  moved: number;
  newRisks: string[];
  at: ISO;
}
