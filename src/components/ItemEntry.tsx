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

/** A scheduled chunk of work inside the Today rail. */
export function BlockEntry({
  item,
  course,
  minutes,
  status,
  late,
  actions,
}: {
  item: Item;
  course?: Course;
  minutes: number;
  status: 'planned' | 'done' | 'missed';
  late?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={`entry${status === 'done' ? ' is-done' : ''}${status === 'missed' ? ' is-missed' : ''}`}
      style={{ borderLeftColor: courseColor(course?.hue) }}
    >
      <div className="entry-main">
        <div className="entry-title" title={item.title}>
          {item.title}
        </div>
        <div className="entry-sub">
          {course && <span style={{ color: courseColor(course.hue) }}>{course.name}</span>}
          <span className="mono">{durationLabel(minutes)}</span>
          {status === 'missed' && <span className="warn-text">moved</span>}
          {late && status === 'planned' && <span className="warn-text">after deadline</span>}
        </div>
      </div>
      {actions}
    </div>
  );
}
