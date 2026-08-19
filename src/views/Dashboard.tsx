import { useMemo, useState } from 'react';
import { useStation } from '../store/useStation';
import { selectors } from '../store/useStation';
import { isCommitment, remainingMin } from '../lib/planner';
import type { Item } from '../lib/types';
import {
  addDays,
  clockLabel,
  d,
  dayKey,
  dueLabel,
  durationLabel,
  format,
  isSameDay,
  relativeDayLabel,
  startOfDay,
} from '../lib/time';
import { BlockEntry, ItemEntry } from '../components/ItemEntry';
import { Empty, Icon } from '../components/ui';
import { ItemEditor } from '../components/ItemEditor';

/** How far ahead "Upcoming" reaches before you ask for more. */
const NEAR_DAYS = 7;

export function Dashboard({ onGoFocus }: { onGoFocus: () => void }) {
  const { items, courses, blocks, lastPlan, settings, replan } = useStation();
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const now = new Date();

  const courseById = useMemo(() => selectors.courseById(courses), [courses]);
  const itemById = useMemo(() => selectors.itemById(items), [items]);
  const riskBy = useMemo(() => new Map((lastPlan?.risks ?? []).map((r) => [r.itemId, r.level])), [lastPlan]);

  /** Today's rail: fixed commitments and planned work blocks, merged in time order. */
  const todayRail = useMemo(() => {
    const rows: Array<{
      at: Date;
      end: Date;
      kind: 'fixed' | 'block';
      item: Item;
      blockId?: string;
      minutes: number;
      status: 'planned' | 'done' | 'missed';
      late?: boolean;
    }> = [];

    for (const item of items) {
      if (item.status === 'archived' || !isCommitment(item)) continue;
      if (!isSameDay(d(item.start!), now)) continue;
      rows.push({
        at: d(item.start!),
        end: d(item.end!),
        kind: 'fixed',
        item,
        minutes: 0,
        status: 'planned',
      });
    }
    for (const b of blocks) {
      if (!isSameDay(d(b.start), now)) continue;
      const item = itemById.get(b.itemId);
      if (!item) continue;
      rows.push({
        at: d(b.start),
        end: d(b.end),
        kind: 'block',
        item,
        blockId: b.id,
        minutes: b.minutes,
        status: b.status,
        late: b.late,
      });
    }
    return rows.sort((a, b) => +a.at - +b.at);
  }, [items, blocks, itemById, now]);

  const nowIndex = todayRail.findIndex((r) => r.at > now);

  /** Seven-day load: planned work vs capacity, with fixed commitments behind it. */
  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, n) => {
        const date = startOfDay(addDays(now, n));
        const key = dayKey(date);
        const work = blocks
          .filter((b) => dayKey(b.start) === key && b.status !== 'missed')
          .reduce((s, b) => s + b.minutes, 0);
        const fixed = items
          .filter((i) => isCommitment(i) && dayKey(i.start!) === key)
          .reduce((s, i) => s + (+d(i.end!) - +d(i.start!)) / 60_000, 0);
        const capacity = lastPlan?.capacityByDay[key] ?? settings.dailyCapacityMin;
        return { date, key, work, fixed, capacity };
      }),
    [blocks, items, lastPlan, settings.dailyCapacityMin, now]
  );

  const allUpcoming = useMemo(
    () =>
      selectors
        .upcoming(items, now)
        .filter((i) => !isCommitment(i))
        .slice(0, 60),
    [items, now]
  );

  // Default to the next week. Everything past that is one click away.
  const horizon = +addDays(now, NEAR_DAYS);
  const near = allUpcoming.filter((i) => +d(i.due ?? i.start!) <= horizon);
  const upcoming = showAll ? allUpcoming : near;
  const hidden = allUpcoming.length - near.length;

  const summary = useMemo(() => {
    const todo = items.filter((i) => i.status === 'todo' && !isCommitment(i));
    const workLeft = todo.reduce((s, i) => s + remainingMin(i), 0);
    const dueSoon = todo.filter((i) => i.due && +d(i.due) < horizon).length;
    const overdue = todo.filter((i) => i.due && +d(i.due) < +now).length;
    return { workLeft, dueSoon, overdue };
  }, [items, now, horizon]);

  // Only the genuinely-impossible surfaces here; "tight" stays a quiet chip on the row.
  const atRisk = (lastPlan?.risks ?? [])
    .filter((r) => r.level === 'at-risk')
    .map((r) => ({ ...r, item: itemById.get(r.itemId) }))
    .filter((r) => r.item && r.item.status === 'todo')
    .sort((a, b) => b.shortfallMin - a.shortfallMin);

  const byDay = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const item of upcoming) {
      const key = dayKey(item.due ?? item.start!);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return [...groups.entries()];
  }, [upcoming]);

  return (
    <div className="narrow">
      <div className="page-head row wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>{greeting()}</h1>
          <p>
            {summary.workLeft > 0
              ? `${durationLabel(summary.workLeft)} of work left, ${summary.dueSoon} due this week.`
              : 'Nothing outstanding. Enjoy it.'}
            {summary.overdue > 0 && <span className="warn-text"> {summary.overdue} overdue.</span>}
          </p>
        </div>
        <div className="row">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setEditing('new')}
            aria-label="Add something"
          >
            <Icon name="plus" size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => replan()} aria-label="Replan">
            <Icon name="refresh" size={14} />
          </button>
          <button className="btn btn-primary" onClick={onGoFocus}>
            <Icon name="play" size={12} /> Start working
          </button>
        </div>
      </div>

      <div className="section-head">
        <h2>Today</h2>
        <span className="count">{clockLabel(now)}</span>
      </div>

      {todayRail.length === 0 ? (
        <div className="card">
          <Empty title="Nothing scheduled today" />
        </div>
      ) : (
        <div className="timeline">
          {todayRail.map((row, i) => (
            <div key={`${row.blockId ?? row.item.id}-${i}`}>
              {i === nowIndex && <div className="now-line" />}
              <div className={`tl-row${row.at <= now && row.end > now ? ' is-now' : ''}`}>
                <div className="tl-time">{clockLabel(row.at)}</div>
                <div className="tl-dot" />
                <div className="tl-body">
                  {row.kind === 'fixed' ? (
                    <ItemEntry item={row.item} course={courseById.get(row.item.courseId ?? '')} compact />
                  ) : (
                    <BlockEntry
                      item={row.item}
                      course={courseById.get(row.item.courseId ?? '')}
                      minutes={row.minutes}
                      status={row.status}
                      late={row.late}
                      actions={
                        row.status === 'planned' ? (
                          <div className="entry-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => useStation.getState().completeBlock(row.blockId!)}
                              aria-label={`Mark ${row.item.title} block done`}
                            >
                              <Icon name="check" size={13} />
                            </button>
                          </div>
                        ) : undefined
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
          {nowIndex === -1 && <div className="now-line" />}
        </div>
      )}

      <div style={{ marginTop: 34 }}>
        <div className="section-head">
          <h2>{showAll ? 'Everything' : 'This week'}</h2>
          <span className="count">{upcoming.length}</span>
        </div>
        {byDay.length === 0 ? (
          <div className="card">
            <Empty title="Clear ahead" />
          </div>
        ) : (
          <div className="grid" style={{ gap: 18 }}>
            {byDay.map(([key, group]) => (
              <div key={key}>
                <div className="day-label">{relativeDayLabel(d(key + 'T12:00:00'))}</div>
                <div className="grid" style={{ gap: 6 }}>
                  {group.map((item) => (
                    <ItemEntry
                      key={item.id}
                      item={item}
                      course={courseById.get(item.courseId ?? '')}
                      onEdit={setEditing}
                      riskLevel={riskBy.get(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {hidden > 0 && (
          <button className="btn btn-ghost btn-sm more" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show less' : `${hidden} more later on`}
          </button>
        )}
      </div>

      <div style={{ marginTop: 34 }}>
        <div className="section-head">
          <h2>Load</h2>
        </div>
        <div className="card card-pad">
          <div className="week">
            {week.map((day) => {
              const total = Math.max(...week.map((w) => w.work + w.fixed), day.capacity, 1);
              return (
                <div className={`week-row${isSameDay(day.date, now) ? ' is-today' : ''}`} key={day.key}>
                  <span className="d">{format(day.date, 'EEE')}</span>
                  <div
                    className="bar"
                    title={`${durationLabel(day.work)} of work · ${durationLabel(day.fixed)} in class`}
                  >
                    <i
                      className={day.work > day.capacity ? 'over' : ''}
                      style={{ width: `${(day.work / total) * 100}%` }}
                    />
                    <i className="fixed" style={{ width: `${(day.fixed / total) * 100}%` }} />
                  </div>
                  <span className="n">{day.work ? durationLabel(day.work) : '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {atRisk.length > 0 && (
        <div>
          <div className="section-head">
            <h2>Won't fit</h2>
            <span className="count">{atRisk.length}</span>
          </div>
          <div className="card card-pad">
            {atRisk.slice(0, 5).map((r) => (
              <div className="risk-row" key={r.itemId}>
                <div className="meta">
                  <strong>{r.item!.title}</strong>
                  <span>
                    {durationLabel(r.shortfallMin)} short before {dueLabel(r.item!.due ?? r.item!.start!)}
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditing(r.item!)}
                  aria-label={`Adjust ${r.item!.title}`}
                >
                  <Icon name="edit" size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && <ItemEditor item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still up?';
  if (h < 12) return 'Good morning.';
  if (h < 17) return 'Good afternoon.';
  return 'Good evening.';
}
