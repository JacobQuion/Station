import { useState } from 'react';
import { useStation } from '../store/useStation';
import { Icon } from '../components/ui';
import { parseIcs } from '../lib/ics';
import { format } from '../lib/time';
import { stableId } from '../lib/id';

const STEPS = [
  {
    n: '01',
    h: 'Import',
    p: 'Connect your school accounts and calendars. Station pulls in classes, assignments, exams and deadlines.',
  },
  {
    n: '02',
    h: 'See',
    p: 'One dashboard for everything you have going on — today, this week, and what is coming.',
  },
  {
    n: '03',
    h: 'Do',
    p: 'Station tells you what to work on next, and rebuilds the plan when you fall behind.',
  },
];

export function ImportView({ onDone }: { onDone: () => void }) {
  const { sources, items, busy, connectIcs, connectCanvas, loadDemo, resync, removeSource } = useStation();
  const [feedUrl, setFeedUrl] = useState('');
  const [host, setHost] = useState('');
  const [token, setToken] = useState('');

  const onFile = async (file: File) => {
    const text = await file.text();
    const id = stableId('src', 'file', file.name);
    try {
      const feed = parseIcs(text, id);
      useStation.setState((s) => ({
        sources: [
          ...s.sources.filter((x) => x.id !== id),
          {
            id,
            kind: 'ics' as const,
            label: file.name,
            itemCount: feed.items.length,
            lastSyncedAt: new Date().toISOString(),
          },
        ],
        courses: [...s.courses.filter((c) => c.sourceId !== id), ...feed.courses],
        items: [...s.items.filter((i) => i.sourceId !== id), ...feed.items],
        onboarded: true,
        notice: `Imported ${feed.items.length} items from ${file.name}.`,
      }));
      useStation.getState().replan();
    } catch (err) {
      useStation.setState({ error: (err as Error).message });
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Import everything once.</h1>
        <p>Station reads the calendar feeds your school already publishes — nothing to enter by hand.</p>
      </div>

      {!sources.length && (
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step-card" key={s.n}>
              <div className="n">STEP {s.n}</div>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
      )}

      <div className="connectors">
        {/* Calendar feed — works for Canvas, Blackboard, Moodle, Google, Apple. */}
        <div className="card connector">
          <div className="connector-head">
            <div className="connector-icon">
              <Icon name="calendar" />
            </div>
            <div>
              <h3>Calendar feed</h3>
              <p>
                Canvas, Blackboard, Moodle, Google Calendar, Apple Calendar — any <code>.ics</code>{' '}
                subscription link.
              </p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (feedUrl.trim()) connectIcs(feedUrl).then(onDone);
            }}
          >
            <div className="field">
              <label htmlFor="feed-url">Subscription link</label>
              <input
                id="feed-url"
                className="input"
                placeholder="https://canvas.school.edu/feeds/calendars/…ics"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                inputMode="url"
                autoComplete="off"
              />
              <span className="hint">
                Fetched through Station's proxy — schools don't allow direct browser access.
              </span>
            </div>
            <div className="row wrap">
              <button className="btn btn-primary" disabled={!feedUrl.trim() || Boolean(busy)}>
                {busy ? busy : 'Connect feed'}
              </button>
              <label className="btn">
                Upload .ics
                <input
                  type="file"
                  accept=".ics,text/calendar"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <details className="how">
              <summary>Where do I find this link?</summary>
              <ol>
                <li>
                  <b>Canvas</b> — Calendar → <code>Calendar Feed</code> in the right sidebar.
                </li>
                <li>
                  <b>Google Calendar</b> — Settings → your calendar →{' '}
                  <code>Secret address in iCal format</code>.
                </li>
                <li>
                  <b>Blackboard</b> — Calendar → <code>Get External Calendar Link</code>.
                </li>
                <li>
                  <b>Moodle</b> — Calendar → <code>Export calendar</code> → get URL.
                </li>
              </ol>
            </details>
          </form>
        </div>

        {/* Canvas API — richer than the ICS export. */}
        <div className="card connector">
          <div className="connector-head">
            <div className="connector-icon">
              <Icon name="sparkles" />
            </div>
            <div>
              <h3>Canvas account</h3>
              <p>
                Pulls courses, assignments, points and submission status — more detail than the calendar feed.
              </p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (host.trim() && token.trim()) connectCanvas(host, token).then(onDone);
            }}
          >
            <div className="field">
              <label htmlFor="canvas-host">Canvas address</label>
              <input
                id="canvas-host"
                className="input"
                placeholder="canvas.school.edu"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="canvas-token">Access token</label>
              <input
                id="canvas-token"
                className="input"
                type="password"
                placeholder="1234~abcdef…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
              <span className="hint">
                Stored in this browser only. It is sent to your Canvas server and nowhere else.
              </span>
            </div>
            <button className="btn btn-primary" disabled={!host.trim() || !token.trim() || Boolean(busy)}>
              {busy ? busy : 'Connect Canvas'}
            </button>
            <details className="how">
              <summary>How to make a token</summary>
              <ol>
                <li>
                  In Canvas, open <code>Account → Settings</code>.
                </li>
                <li>
                  Scroll to <b>Approved Integrations</b> → <code>+ New Access Token</code>.
                </li>
                <li>Name it "Station", leave the expiry blank, then copy the token.</li>
              </ol>
            </details>
          </form>
        </div>
      </div>

      <div className="row wrap" style={{ marginTop: 18, justifyContent: 'center' }}>
        <button
          className="btn btn-ghost"
          onClick={() => {
            loadDemo();
            onDone();
          }}
        >
          <Icon name="sparkles" size={14} /> Try it with a sample semester
        </button>
      </div>

      {sources.length > 0 && (
        <div style={{ marginTop: 34 }}>
          <div className="section-head">
            <h2>Connected</h2>
            <span className="count">{items.length} items</span>
          </div>
          <div className="card">
            {sources.map((s) => (
              <div className="source-row" key={s.id}>
                <div className="connector-icon" style={{ width: 32, height: 32, fontSize: 14 }}>
                  <Icon
                    name={s.kind === 'canvas' ? 'sparkles' : s.kind === 'demo' ? 'sparkles' : 'calendar'}
                    size={14}
                  />
                </div>
                <div className="meta">
                  <strong>{s.label}</strong>
                  <span>
                    {s.lastError
                      ? s.lastError
                      : `${s.itemCount} items · synced ${s.lastSyncedAt ? format(new Date(s.lastSyncedAt), "MMM d 'at' h:mm a") : 'never'}`}
                  </span>
                </div>
                {s.lastError && <span className="chip chip-danger">Error</span>}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => resync(s.id)}
                  disabled={Boolean(busy)}
                  aria-label={`Resync ${s.label}`}
                >
                  <Icon name="refresh" size={13} />
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-danger"
                  onClick={() => removeSource(s.id)}
                  aria-label={`Remove ${s.label}`}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-lg" onClick={onDone}>
              See everything →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
