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
  startOfCalendarWeek,
  relativeDayLabel,
  startOfDay,
} from '../lib/time';
import { BlockEntry, ItemEntry } from '../components/ItemEntry';
import { Empty, FieldHelp, Icon } from '../components/ui';
import { ItemEditor } from '../components/ItemEditor';
import { NowCard } from '../components/NowCard';

/** Tasks shown before the list has to be expanded. */
const VISIBLE_TASKS = 5;

export function View({ onGoImport }: { onGoImport: () => void }) {
  const { items, courses, blocks, lastPlan, settings, replan, name } = useStation();
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  /** Block id whose estimate is being retyped inline on the Today rail. */
  const [estimating, setEstimating] = useState<string | null>(null);
  /** The main rectangle shows one of these at a time. */
  const [panel, setPanel] = useState<'timer' | 'load'>('timer');
  /** The rail shows one of these at a time. Today first — what's in front of you
      before what's ahead of you. */
  const [rail, setRail] = useState<'upcoming' | 'today'>('today');
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

  const todayShown = todayOpen ? todayRail : todayRail.slice(0, VISIBLE_TASKS);
  const todayHidden = todayRail.length - todayShown.length;
  // Anchored to what is actually rendered, so the marker can't fall off the end.
  const nowIndex = todayShown.findIndex((r) => r.at > now);

  /** Seven-day load: planned work vs capacity, with fixed commitments behind it. */
  const week = useMemo(
    () =>
      // The calendar week that contains today, so the chart always reads
      // Monday through Sunday rather than starting on whatever day it is.
      Array.from({ length: 7 }, (_, n) => {
        const date = startOfDay(addDays(startOfCalendarWeek(now), n));
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

  // Histogram scale. Bars stop at 88% so each column's label has headroom.
  const histCeiling = Math.max(...week.map((w) => w.work + w.fixed), settings.dailyCapacityMin, 60);
  const histStep = histCeiling <= 180 ? 60 : histCeiling <= 420 ? 120 : 180;
  const histTicks: number[] = [];
  for (let t = 0; t <= histCeiling; t += histStep) histTicks.push(t);
  const histPct = (v: number) => (v / histCeiling) * 88;

  const allUpcoming = useMemo(
    () =>
      selectors
        .upcoming(items, now)
        .filter((i) => !isCommitment(i))
        .slice(0, 60),
    [items, now]
  );

  // A short list by default; the rest is one click away and scrolls in place.
  const horizon = +addDays(now, 7);
  const upcoming = expanded ? allUpcoming : allUpcoming.slice(0, VISIBLE_TASKS);
  const hidden = allUpcoming.length - upcoming.length;

  const summary = useMemo(() => {
    const todo = items.filter((i) => i.status === 'todo' && !isCommitment(i));
    const workLeft = todo.reduce((s, i) => s + remainingMin(i), 0);
    const dueSoon = todo.filter((i) => i.due && +d(i.due) < horizon).length;
    // Kept as items, not a count — the count is clickable and lists them.
    const overdue = todo
      .filter((i) => i.due && +d(i.due) < +now)
      .sort((a, b) => +d(a.due!) - +d(b.due!));
    return { workLeft, dueSoon, overdue };
  }, [items, now, horizon]);

  const byDay = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const item of upcoming) {
      const key = dayKey(item.due ?? item.start!);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return [...groups.entries()];
  }, [upcoming]);

  if (!items.length) {
    return (
      <div className="wide">
        <div className="page-head">
          <h1>Nothing here yet.</h1>
          <p>Connect a calendar and Station will fill this in.</p>
        </div>
        <div className="card card-pad">
          <Empty title="No classes, assignments or deadlines">
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-primary" onClick={onGoImport}>
                Import your schedule
              </button>
            </div>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="wide">
      <div className="page-head row wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>{greeting(name)}</h1>
          <p>
            {summary.workLeft > 0
              ? `${durationLabel(summary.workLeft)} of work left, ${summary.dueSoon} ${
                  summary.dueSoon === 1 ? 'task' : 'tasks'
                } due this week.`
              : 'Nothing outstanding. Enjoy it.'}
            {summary.overdue.length > 0 && (
              <>
                {' '}
                <FieldHelp
                  title={`${summary.overdue.length} overdue`}
                  label={`${summary.overdue.length} overdue`}
                >
                  <ul className="pop-list">
                    {summary.overdue.map((i) => (
                      <li key={i.id}>
                        <b>{i.title}</b>
                        <span>{dueLabel(i.due!, now)}</span>
                      </li>
                    ))}
                  </ul>
                </FieldHelp>
              </>
            )}
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setEditing('new')}>
            <Icon name="plus" size={13} /> Add
          </button>
          <button className="btn" onClick={() => replan()}>
            <Icon name="refresh" size={13} /> Replan
          </button>
        </div>
      </div>

      <div className="work">
        <div className="work-main">
          {panel === 'timer' ? (
            <NowCard />
          ) : (
            <div className="card now-card is-panel">
              <div className="section-head">
                <h2>Load</h2>
                <span className="count">this week</span>
              </div>
              <div className="panel-body">
                <div className="hist">
                  <div className="hist-axis">
                    {histTicks.map((t) => (
                      <span key={t} style={{ bottom: `${histPct(t)}%` }}>
                        {t === 0 ? '0' : durationLabel(t)}
                      </span>
                    ))}
                  </div>

                  <div className="hist-cols">
                    <div className="hist-grid">
                      {histTicks.map((t) => (
                        <i key={t} style={{ bottom: `${histPct(t)}%` }} />
                      ))}
                    </div>

                    {week.map((day) => {
                      const today = isSameDay(day.date, now);
                      const total = day.work + day.fixed;
                      return (
                        <div className={`hist-col${today ? ' is-today' : ''}`} key={day.key}>
                          <div
                            className="hist-plot"
                            title={`${durationLabel(day.work)} of work · ${durationLabel(day.fixed)} in class`}
                          >
                            {total > 0 && (
                              <span className="hist-val" style={{ bottom: `${histPct(total)}%` }}>
                                {durationLabel(total)}
                              </span>
                            )}
                            <div className="hist-stack">
                              {/* Class time rides on top; the work you control sits on the base. */}
                              <div className="hist-seg fixed" style={{ height: `${histPct(day.fixed)}%` }} />
                              <div
                                className={`hist-seg work${day.work > day.capacity ? ' is-over' : ''}`}
                                style={{ height: `${histPct(day.work)}%` }}
                              />
                            </div>
                          </div>
                          <span className="hist-day">{format(day.date, 'EEE')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="hist-key">
                  <span>
                    <i className="k work" /> work
                  </span>
                  <span>
                    <i className="k fixed" /> class
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            className={`btn panel-toggle${panel === 'load' ? ' is-load' : ''}`}
            onClick={() => setPanel(panel === 'load' ? 'timer' : 'load')}
          >
            <Icon name={panel === 'load' ? 'clock' : 'chart'} size={14} />
            {panel === 'load' ? 'Timer' : 'Load'}
          </button>
        </div>

        <div className="work-list">
          <div className="rail-body">
            {rail === 'upcoming' ? (
              <div>
                <div className="section-head">
                  <h2>Coming up</h2>
                  <span className="count">{allUpcoming.length}</span>
                  {(hidden > 0 || expanded) && (
                    <button className="btn btn-sm more" onClick={() => setExpanded(!expanded)}>
                      <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={12} />
                      {expanded ? 'Collapse' : `Expand — ${hidden} more`}
                    </button>
                  )}
                </div>
                {byDay.length === 0 ? (
                  <div className="card">
                    <Empty title="Clear ahead" />
                  </div>
                ) : (
                  <div className={`grid${expanded ? ' task-scroll' : ''}`} style={{ gap: 18 }}>
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
              </div>
            ) : (
              <div>
                <div className="section-head">
                  <h2>Today</h2>
                  <span className="count">{clockLabel(now)}</span>
                  {(todayHidden > 0 || todayOpen) && (
                    <button className="btn btn-sm more" onClick={() => setTodayOpen(!todayOpen)}>
                      <Icon name={todayOpen ? 'chevronUp' : 'chevronDown'} size={12} />
                      {todayOpen ? 'Collapse' : `Expand — ${todayHidden} more`}
                    </button>
                  )}
                </div>

                {todayRail.length === 0 ? (
                  <div className="card">
                    <Empty title="Nothing scheduled today" />
                  </div>
                ) : (
                  <div className={`timeline${todayOpen ? ' task-scroll' : ''}`}>
                    {todayShown.map((row, i) => (
                      <div key={`${row.blockId ?? row.item.id}-${i}`}>
                        {i === nowIndex && <div className="now-line" />}
                        <div className={`tl-row${row.at <= now && row.end > now ? ' is-now' : ''}`}>
                          <div className="tl-time">{clockLabel(row.at)}</div>
                          <div className="tl-dot" />
                          <div className="tl-body">
                            {row.kind === 'fixed' ? (
                              <ItemEntry
                                item={row.item}
                                course={courseById.get(row.item.courseId ?? '')}
                                compact
                              />
                            ) : (
                              <BlockEntry
                                item={row.item}
                                course={courseById.get(row.item.courseId ?? '')}
                                minutes={row.minutes}
                                status={row.status}
                                late={row.late}
                                estimating={estimating === row.blockId}
                                onEstimate={(open) => setEstimating(open ? row.blockId! : null)}
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
              </div>
            )}
          </div>

          <button
            className="btn rail-toggle"
            onClick={() => setRail(rail === 'upcoming' ? 'today' : 'upcoming')}
          >
            <Icon name={rail === 'upcoming' ? 'clock' : 'calendar'} size={14} />
            {rail === 'upcoming' ? 'Today' : 'Coming up'}
          </button>
        </div>
      </div>

      {editing && <ItemEditor item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Still Up' : h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  return name ? `${part}, ${name}.` : `${part}.`;
}
