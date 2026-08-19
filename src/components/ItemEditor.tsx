import { useState } from 'react';
import type { Item } from '../lib/types';
import { useStation } from '../store/useStation';
import { Icon, Modal } from './ui';
import { format } from '../lib/time';

const toLocalInput = (v?: string) => (v ? format(new Date(v), "yyyy-MM-dd'T'HH:mm") : '');
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined);

export function ItemEditor({ item, onClose }: { item: Item | 'new'; onClose: () => void }) {
  const { courses, updateItem, addItem, removeItem } = useStation();
  const isNew = item === 'new';
  const base = isNew ? null : item;

  const [title, setTitle] = useState(base?.title ?? '');
  const [kind, setKind] = useState<Item['kind']>(base?.kind ?? 'task');
  const [courseId, setCourseId] = useState(base?.courseId ?? '');
  const [due, setDue] = useState(toLocalInput(base?.due));
  const [estimate, setEstimate] = useState(String(base?.estimateMin ?? 45));
  const [priority, setPriority] = useState(String(base?.priority ?? 2));
  const [notes, setNotes] = useState(base?.notes ?? '');

  const save = () => {
    if (!title.trim()) return;
    const patch = {
      title: title.trim(),
      kind,
      courseId: courseId || undefined,
      due: fromLocalInput(due),
      estimateMin: Math.max(0, Number(estimate) || 0),
      priority: (Number(priority) || 2) as 1 | 2 | 3,
      notes: notes.trim() || undefined,
    };
    if (isNew) addItem(patch);
    else updateItem(base!.id, patch);
    onClose();
  };

  return (
    <Modal
      title={isNew ? 'Add something to do' : 'Edit item'}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button
              className="btn btn-danger"
              onClick={() => {
                removeItem(base!.id);
                onClose();
              }}
            >
              <Icon name="trash" size={13} /> Delete
            </button>
          )}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>
            Save
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="ed-title">What is it?</label>
        <input
          id="ed-title"
          className="input"
          value={title}
          autoFocus
          placeholder="Finish lab report"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </div>

      <div className="settings-grid">
        <div className="field">
          <label htmlFor="ed-kind">Type</label>
          <select
            id="ed-kind"
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as Item['kind'])}
          >
            <option value="task">Task</option>
            <option value="assignment">Assignment</option>
            <option value="exam">Exam</option>
            <option value="event">Event</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ed-course">Course</label>
          <select
            id="ed-course"
            className="input"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-grid">
        <div className="field">
          <label htmlFor="ed-due">Due</label>
          <input
            id="ed-due"
            className="input"
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ed-est">Work needed (minutes)</label>
          <input
            id="ed-est"
            className="input mono"
            type="number"
            min="0"
            step="15"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
          />
          <span className="hint">Station schedules this much time before the deadline.</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ed-pri">Priority</label>
        <select id="ed-pri" className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="3">High — pull it earlier</option>
          <option value="2">Normal</option>
          <option value="1">Low — fill in around everything else</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="ed-notes">Notes</label>
        <textarea
          id="ed-notes"
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </div>
    </Modal>
  );
}
