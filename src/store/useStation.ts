import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Block, Course, Item, PlanResult, ReplanReport, Settings, Source } from '../lib/types';
import { markMissed, plan, remainingMin } from '../lib/planner';
import { fetchIcs, parseIcs, type ParsedFeed } from '../lib/ics';
import { importCanvas } from '../lib/canvas';
import { buildDemo } from '../lib/demo';
import { newId, stableId } from '../lib/id';
import { d, iso } from '../lib/time';

export const DEFAULT_SETTINGS: Settings = {
  dayStartMin: 9 * 60,
  dayEndMin: 22 * 60,
  focusMin: 50,
  minBlockMin: 20,
  breakMin: 10,
  dailyCapacityMin: 240,
  daysOff: [],
  commuteMin: 10,
  horizonDays: 14,
};

interface State {
  sources: Source[];
  courses: Course[];
  items: Item[];
  blocks: Block[];
  settings: Settings;
  onboarded: boolean;
  /** First name, used only for the greeting. Stays in this browser. */
  name: string;
  theme: 'dark' | 'light';
  lastPlan?: PlanResult;
  lastReplan?: ReplanReport;
  busy: string | null;
  error: string | null;
  notice: string | null;

  connectIcs: (url: string, label?: string) => Promise<void>;
  connectCanvas: (host: string, token: string) => Promise<void>;
  loadDemo: () => void;
  resync: (sourceId: string) => Promise<void>;
  removeSource: (sourceId: string) => void;

  addItem: (draft: Partial<Item> & Pick<Item, 'title'>) => void;
  updateItem: (id: string, patch: Partial<Item>) => void;
  removeItem: (id: string) => void;
  toggleDone: (id: string) => void;
  logProgress: (itemId: string, minutes: number) => void;

  completeBlock: (blockId: string) => void;
  skipBlock: (blockId: string) => void;
  replan: (reason?: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  setName: (name: string) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  dismiss: () => void;
  reset: () => void;
}

/** Merge imported records over existing ones, preserving user edits. */
function mergeItems(existing: Item[], incoming: Item[], sourceId: string): Item[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  const seen = new Set<string>();

  for (const next of incoming) {
    seen.add(next.id);
    const prev = byId.get(next.id);
    byId.set(
      next.id,
      prev
        ? {
            ...next,
            // These belong to the user, not the origin system.
            estimateMin: prev.estimateMin,
            progressMin: prev.progressMin,
            priority: prev.priority,
            status: next.status === 'done' ? 'done' : prev.status,
            notes: prev.notes ?? next.notes,
            createdAt: prev.createdAt,
            updatedAt: iso(new Date()),
          }
        : next
    );
  }

  // Drop records this source no longer reports (assignment deleted upstream),
  // but never touch anything the user finished or created by hand.
  for (const item of existing) {
    if (
      item.sourceId === sourceId &&
      !seen.has(item.id) &&
      item.status === 'todo' &&
      item.progressMin === 0
    ) {
      byId.delete(item.id);
    }
  }
  return [...byId.values()];
}

const mergeCourses = (existing: Course[], incoming: Course[]) => {
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, { ...byId.get(c.id), ...c });
  return [...byId.values()];
};

export const useStation = create<State>()(
  persist(
    (set, get) => {
      /** Single funnel: every mutation that can change the schedule ends here. */
      const rebuild = (report?: Partial<ReplanReport>) => {
        const { items, settings, blocks } = get();
        const now = new Date();
        const { blocks: swept, missed } = markMissed(blocks, now);
        const history = swept.filter((b) => b.status !== 'planned');
        const before = new Set(
          get()
            .lastPlan?.risks.filter((r) => r.level === 'at-risk')
            .map((r) => r.itemId) ?? []
        );

        const result = plan({ items, settings, now, history });
        const newRisks = result.risks
          .filter((r) => r.level === 'at-risk' && !before.has(r.itemId))
          .map((r) => r.itemId);

        set({
          blocks: result.blocks,
          lastPlan: result,
          lastReplan: report
            ? {
                missed,
                moved: result.blocks.filter((b) => b.status === 'planned').length,
                newRisks,
                at: iso(now),
                ...report,
              }
            : get().lastReplan,
        });
      };

      const applyFeed = (source: Source, feed: ParsedFeed) => {
        set((s) => ({
          courses: mergeCourses(s.courses, feed.courses),
          items: mergeItems(s.items, feed.items, source.id),
          sources: [
            ...s.sources.filter((x) => x.id !== source.id),
            { ...source, lastSyncedAt: iso(new Date()), lastError: undefined, itemCount: feed.items.length },
          ],
          onboarded: true,
          busy: null,
          error: null,
          notice: `Imported ${feed.items.length} items from ${source.label}.`,
        }));
        rebuild();
      };

      const fail = (sourceId: string | null, message: string) => {
        set((s) => ({
          busy: null,
          error: message,
          sources: sourceId
            ? s.sources.map((x) => (x.id === sourceId ? { ...x, lastError: message } : x))
            : s.sources,
        }));
      };

      return {
        sources: [],
        courses: [],
        items: [],
        blocks: [],
        settings: DEFAULT_SETTINGS,
        onboarded: false,
        name: '',
        theme: 'dark',
        busy: null,
        error: null,
        notice: null,

        async connectIcs(url, label) {
          const id = stableId('src', 'ics', url.trim());
          set({ busy: 'Fetching calendar…', error: null });
          try {
            const text = await fetchIcs(url);
            set({ busy: 'Reading events…' });
            const feed = parseIcs(text, id);
            applyFeed(
              {
                id,
                kind: 'ics',
                label: label?.trim() || hostLabel(url),
                url: url.trim(),
                itemCount: feed.items.length,
              },
              feed
            );
          } catch (err) {
            fail(null, (err as Error).message);
          }
        },

        async connectCanvas(host, token) {
          const clean = host
            .trim()
            .replace(/^https?:\/\//, '')
            .replace(/\/+$/, '');
          const id = stableId('src', 'canvas', clean);
          set({ busy: 'Talking to Canvas…', error: null });
          try {
            const feed = await importCanvas(clean, token.trim(), id);
            applyFeed(
              {
                id,
                kind: 'canvas',
                label: clean,
                url: clean,
                token: token.trim(),
                itemCount: feed.items.length,
              },
              feed
            );
          } catch (err) {
            fail(null, (err as Error).message);
          }
        },

        loadDemo() {
          const id = 'src_demo';
          const { items, courses } = buildDemo(id);
          applyFeed(
            { id, kind: 'demo', label: 'Sample semester', itemCount: items.length },
            { items, courses, warnings: [] }
          );
        },

        async resync(sourceId) {
          const source = get().sources.find((s) => s.id === sourceId);
          if (!source) return;
          if (source.kind === 'demo') return get().loadDemo();
          set({ busy: `Syncing ${source.label}…`, error: null });
          try {
            const feed =
              source.kind === 'canvas'
                ? await importCanvas(source.url!, source.token!, source.id)
                : parseIcs(await fetchIcs(source.url!), source.id);
            applyFeed(source, feed);
          } catch (err) {
            fail(sourceId, (err as Error).message);
          }
        },

        removeSource(sourceId) {
          set((s) => ({
            sources: s.sources.filter((x) => x.id !== sourceId),
            items: s.items.filter((i) => i.sourceId !== sourceId),
            courses: s.courses.filter((c) => c.sourceId !== sourceId),
          }));
          rebuild();
        },

        addItem(draft) {
          const now = iso(new Date());
          set((s) => ({
            items: [
              ...s.items,
              {
                id: newId('itm'),
                sourceId: 'manual',
                kind: 'task',
                estimateMin: 45,
                progressMin: 0,
                status: 'todo',
                priority: 2,
                createdAt: now,
                updatedAt: now,
                ...draft,
              } as Item,
            ],
            onboarded: true,
          }));
          rebuild();
        },

        updateItem(id, patch) {
          set((s) => ({
            items: s.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: iso(new Date()) } : i)),
          }));
          rebuild();
        },

        removeItem(id) {
          set((s) => ({
            items: s.items.filter((i) => i.id !== id),
            blocks: s.blocks.filter((b) => b.itemId !== id),
          }));
          rebuild();
        },

        toggleDone(id) {
          const item = get().items.find((i) => i.id === id);
          if (!item) return;
          const done = item.status !== 'done';
          set((s) => ({
            items: s.items.map((i) =>
              i.id === id
                ? {
                    ...i,
                    status: done ? 'done' : 'todo',
                    progressMin: done ? i.estimateMin : i.progressMin,
                    updatedAt: iso(new Date()),
                  }
                : i
            ),
            // Finished work shouldn't keep occupying future slots.
            blocks: done ? s.blocks.filter((b) => !(b.itemId === id && b.status === 'planned')) : s.blocks,
          }));
          rebuild();
        },

        logProgress(itemId, minutes) {
          set((s) => ({
            items: s.items.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    progressMin: Math.max(0, i.progressMin + minutes),
                    status: i.progressMin + minutes >= i.estimateMin ? 'done' : i.status,
                    updatedAt: iso(new Date()),
                  }
                : i
            ),
          }));
          rebuild();
        },

        completeBlock(blockId) {
          const block = get().blocks.find((b) => b.id === blockId);
          if (!block) return;
          set((s) => ({ blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, status: 'done' } : b)) }));
          get().logProgress(block.itemId, block.minutes);
          const item = get().items.find((i) => i.id === block.itemId);
          set({
            notice:
              item && remainingMin(item) === 0 ? `${item.title} is done. 🎉` : `Logged ${block.minutes}m.`,
          });
        },

        skipBlock(blockId) {
          set((s) => ({ blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, status: 'missed' } : b)) }));
          rebuild({ missed: 1 });
          set({ notice: 'Skipped — that work has been moved into your next free slot.' });
        },

        replan(reason) {
          rebuild({ missed: 0 });
          set({ notice: reason ?? 'Schedule recalculated.' });
        },

        updateSettings(patch) {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
          rebuild();
        },

        setName(name) {
          set({ name: name.trim().slice(0, 40) });
        },

        setTheme(theme) {
          set({ theme });
          document.documentElement.dataset.theme = theme;
        },

        dismiss: () => set({ error: null, notice: null }),

        reset: () =>
          set({
            sources: [],
            courses: [],
            items: [],
            blocks: [],
            onboarded: false,
            lastPlan: undefined,
            lastReplan: undefined,
            error: null,
            notice: null,
            settings: DEFAULT_SETTINGS,
          }),
      };
    },
    {
      name: 'station.v1',
      partialize: (s) => ({
        sources: s.sources,
        courses: s.courses,
        items: s.items,
        blocks: s.blocks,
        settings: s.settings,
        onboarded: s.onboarded,
        name: s.name,
        theme: s.theme,
        lastPlan: s.lastPlan,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        document.documentElement.dataset.theme = state.theme;
        // Time passed while the app was closed — catch up before first paint.
        if (state.items.length) state.replan('Welcome back — your plan is up to date.');
      },
    }
  )
);

function hostLabel(url: string) {
  try {
    const host = new URL(url.replace(/^webcal:/i, 'https:')).hostname.replace(/^www\./, '');
    if (host.includes('google')) return 'Google Calendar';
    if (host.includes('instructure') || host.includes('canvas')) return 'Canvas';
    return host;
  } catch {
    return 'Calendar feed';
  }
}

/** Derived views the UI reads. Kept outside the store so they stay pure. */
export const selectors = {
  itemById: (items: Item[]) => new Map(items.map((i) => [i.id, i])),
  courseById: (courses: Course[]) => new Map(courses.map((c) => [c.id, c])),
  upcoming: (items: Item[], now = new Date()) =>
    items
      .filter((i) => i.status === 'todo' && (i.due || i.start))
      .sort((a, b) => +d(a.due ?? a.start!) - +d(b.due ?? b.start!))
      .filter((i) => +d(i.due ?? i.start!) > +now - 36e5),
};
