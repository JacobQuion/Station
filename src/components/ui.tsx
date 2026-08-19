import { useEffect, type ReactNode } from 'react';

export const COURSE_COLORS = [
  'var(--c0)',
  'var(--c1)',
  'var(--c2)',
  'var(--c3)',
  'var(--c4)',
  'var(--c5)',
  'var(--c6)',
  'var(--c7)',
];
export const courseColor = (hue?: number) =>
  hue === undefined ? 'var(--text-3)' : COURSE_COLORS[hue % COURSE_COLORS.length];

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const p: Record<string, ReactNode> = {
    check: <polyline points="4 8.5 6.8 11.5 12 4.5" />,
    plus: (
      <>
        <line x1="8" y1="3" x2="8" y2="13" />
        <line x1="3" y1="8" x2="13" y2="8" />
      </>
    ),
    x: (
      <>
        <line x1="4" y1="4" x2="12" y2="12" />
        <line x1="12" y1="4" x2="4" y2="12" />
      </>
    ),
    refresh: (
      <>
        <path d="M13.5 8a5.5 5.5 0 1 1-1.7-4" />
        <polyline points="13.5 1.6 13.5 4.6 10.5 4.6" />
      </>
    ),
    play: <polygon points="5,3.5 12.5,8 5,12.5" fill="currentColor" stroke="none" />,
    pause: (
      <>
        <rect x="4.5" y="3.5" width="2.5" height="9" fill="currentColor" stroke="none" />
        <rect x="9" y="3.5" width="2.5" height="9" fill="currentColor" stroke="none" />
      </>
    ),
    skip: (
      <>
        <polygon points="4,3.5 10,8 4,12.5" fill="currentColor" stroke="none" />
        <line x1="12" y1="3.5" x2="12" y2="12.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="8" cy="8" r="6" />
        <polyline points="8 4.6 8 8 10.4 9.4" />
      </>
    ),
    alert: (
      <>
        <path d="M8 2.2 14.4 13H1.6z" />
        <line x1="8" y1="6.3" x2="8" y2="9.2" />
        <circle cx="8" cy="11" r=".6" fill="currentColor" />
      </>
    ),
    trash: (
      <>
        <polyline points="2.8 4.2 13.2 4.2" />
        <path d="M4.4 4.2v8.4h7.2V4.2" />
        <path d="M6.4 4.2V2.6h3.2v1.6" />
      </>
    ),
    edit: (
      <>
        <path d="M11.2 2.6 13.4 4.8 5.6 12.6 2.6 13.4 3.4 10.4z" />
      </>
    ),
    link: (
      <>
        <path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-1 1" />
        <path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.5 8.8a2.6 2.6 0 0 0 3.7 3.7l1-1" />
      </>
    ),
    calendar: (
      <>
        <rect x="2.2" y="3.4" width="11.6" height="10.4" rx="1.6" />
        <line x1="2.2" y1="6.4" x2="13.8" y2="6.4" />
        <line x1="5.4" y1="1.8" x2="5.4" y2="4" />
        <line x1="10.6" y1="1.8" x2="10.6" y2="4" />
      </>
    ),
    sparkles: (
      <>
        <path d="M8 1.8 9.3 5.7 13.2 7 9.3 8.3 8 12.2 6.7 8.3 2.8 7 6.7 5.7z" />
        <path d="M12.6 10.6l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" />
      </>
    ),
    sun: (
      <>
        <circle cx="8" cy="8" r="3.1" />
        <line x1="8" y1="1.2" x2="8" y2="2.8" />
        <line x1="8" y1="13.2" x2="8" y2="14.8" />
        <line x1="1.2" y1="8" x2="2.8" y2="8" />
        <line x1="13.2" y1="8" x2="14.8" y2="8" />
        <line x1="3.4" y1="3.4" x2="4.5" y2="4.5" />
        <line x1="11.5" y1="11.5" x2="12.6" y2="12.6" />
        <line x1="12.6" y1="3.4" x2="11.5" y2="4.5" />
        <line x1="4.5" y1="11.5" x2="3.4" y2="12.6" />
      </>
    ),
    moon: <path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6z" />,
    gear: (
      <>
        <circle cx="8" cy="8" r="2.3" />
        <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {p[name]}
    </svg>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      className="checkbox"
      data-checked={checked}
      onClick={onChange}
      aria-pressed={checked}
      title={label}
      aria-label={label}
    >
      <Icon name="check" size={12} />
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
