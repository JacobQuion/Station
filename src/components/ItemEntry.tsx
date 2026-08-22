import { useEffect, useRef, useState } from 'react';
import type { Course, Item } from '../lib/types';
import { remainingMin } from '../lib/planner';
import { dueLabel, durationLabel, rangeLabel } from '../lib/time';
import { Checkbox, Icon, courseColor } from './ui';
import { useStation } from '../store/useStation';

/**
 * One row. Deliberately spare: a title, who it belongs to, and when it's due.
 * Everything else (type, effort, links) lives in the editor — putting it all on
 * the row turned a reading list into a wall of chips.
 */
export function ItemEntry({
  item,
  course,
  onEdit,
  compact = false,
  riskLevel,
}: {
  item: Item;
  course?: Course;
  onEdit?: (item: Item) => void;
  /** Inside the Today rail the gutter already shows the time, so drop it here. */
  compact?: boolean;
  riskLevel?: 'tight' | 'at-risk';
}) {
  const toggleDone = useStation((s) => s.toggleDone);
  const fixed = Boolean(item.start && item.end && item.kind !== 'assignment') && !item.allDay;
  const left = remainingMin(item);
  const overdue = item.due && new Date(item.due) < new Date() && item.status === 'todo';
  const checkable = item.kind !== 'class' && item.kind !== 'event';

  return (
    <div
      className={`entry${fixed ? ' is-fixed' : ''}${item.status === 'done' ? ' is-done' : ''}`}
      style={{ borderLeftColor: courseColor(course?.hue) }}
    >
      {checkable && (
        <Checkbox
          checked={item.status === 'done'}
          onChange={() => toggleDone(item.id)}
          label={`Mark ${item.title} done`}
        />
      )}

      <div className="entry-main">
        <div className="entry-title" title={item.title}>
          {item.title}
        </div>
        <div className="entry-sub">
          {course && <span style={{ color: courseColor(course.hue) }}>{course.name}</span>}
          {!compact && item.due && !fixed && (
            <span className={overdue ? 'warn-text' : undefined}>
              {overdue ? 'overdue' : dueLabel(item.due)}
            </span>
          )}
          {!compact && checkable && left > 0 && <span className="mono">{durationLabel(left)}</span>}
          {compact && fixed && <span className="mono">{rangeLabel(item.start!, item.end!)}</span>}
          {item.allDay && <span>All day</span>}
          {riskLevel === 'at-risk' && <span className="warn-text">won't fit</span>}
        </div>
      </div>

      <div className="entry-actions">
        {onEdit && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onEdit(item)}
            aria-label={`Edit ${item.title}`}
          >
            <Icon name="edit" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Common guesses, so the usual correction is one click rather than typing. */
const ESTIMATE_PRESETS = [15, 30, 45, 60, 90, 120];

/**
 * Inline estimate editor. Re-guessing how long something takes is the most
 * common correction once a plan is on screen, so it happens on the row itself
 * — going through the full editor for one number was the reason nobody did it.
 */
function EstimateEdit({ item, onClose }: { item: Item; onClose: () => void }) {
  const updateItem = useStation((s) => s.updateItem);
  const [value, setValue] = useState(String(item.estimateMin));
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape has to beat the blur handler, which would otherwise save on the way out.
  const cancelled = useRef(false);

  useEffect(() => inputRef.current?.select(), []);

  const commit = (minutes?: number) => {
    if (cancelled.current) return;
    const next = Math.max(0, Math.round(minutes ?? Number(value)));
    if (Number.isFinite(next) && next !== item.estimateMin) updateItem(item.id, { estimateMin: next });
    onClose();
  };

  return (
    <div
      className="estimate-edit"
      // Anywhere outside this row saves what's typed; the presets keep focus
      // inside so their click still lands.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
      }}
    >
      <div className="estimate-field">
        <input
          ref={inputRef}
          className="input mono estimate-input"
          type="number"
          min="0"
          step="5"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              cancelled.current = true;
              onClose();
            }
          }}
          aria-label={`How long ${item.title} will take, in minutes`}
        />
        <span className="estimate-unit">min total</span>
      </div>
      <div className="estimate-presets">
        {ESTIMATE_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            className={`estimate-preset${m === item.estimateMin ? ' is-on' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(m)}
          >
            {durationLabel(m)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A scheduled chunk of work inside the Today rail. */
export function BlockEntry({
  item,
  course,
  minutes,
  status,
  late,
  actions,
  estimating = false,
  onEstimate,
}: {
  item: Item;
  course?: Course;
  minutes: number;
  status: 'planned' | 'done' | 'missed';
  late?: boolean;
  actions?: React.ReactNode;
  /** True while this row's estimate editor is open. */
  estimating?: boolean;
  /** Present when the row can be clicked to re-estimate the underlying item. */
  onEstimate?: (open: boolean) => void;
}) {
  const editable = Boolean(onEstimate);
  // Pressing the title while the editor is open blurs it shut — and saves —
  // before the click lands, so by then `estimating` already reads false and a
  // naive toggle would reopen the row it just closed. Read the state at press
  // time instead, which is the state the click is answering.
  const openAtPress = useRef(estimating);

  return (
    <div
      className={`entry${status === 'done' ? ' is-done' : ''}${status === 'missed' ? ' is-missed' : ''}${
        editable ? ' is-editable' : ''
      }${estimating ? ' is-estimating' : ''}`}
      style={{ borderLeftColor: courseColor(course?.hue) }}
    >
      <div className="entry-main">
        {editable ? (
          <button
            type="button"
            className="entry-title entry-title-toggle"
            title={item.title}
            onMouseDown={() => (openAtPress.current = estimating)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openAtPress.current = estimating;
            }}
            onClick={() => onEstimate!(!openAtPress.current)}
            aria-expanded={estimating}
            aria-label={`${estimating ? 'Hide' : 'Show'} how long ${item.title} should take`}
          >
            {item.title}
          </button>
        ) : (
          <div className="entry-title" title={item.title}>
            {item.title}
          </div>
        )}
        {estimating ? (
          <EstimateEdit item={item} onClose={() => onEstimate!(false)} />
        ) : (
          <div className="entry-sub">
            {course && <span style={{ color: courseColor(course.hue) }}>{course.name}</span>}
            <span className="mono">{durationLabel(minutes)}</span>
            {editable && (
              <span className="est-chip">
                <Icon name="edit" size={10} /> {durationLabel(item.estimateMin)} total
              </span>
            )}
            {status === 'missed' && <span className="warn-text">moved</span>}
            {late && status === 'planned' && <span className="warn-text">after deadline</span>}
          </div>
        )}
      </div>
      {actions}
    </div>
  );
}
