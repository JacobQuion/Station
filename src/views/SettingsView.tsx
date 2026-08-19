import { useState } from 'react';
import { DEFAULT_SETTINGS, useStation } from '../store/useStation';
import { durationLabel } from '../lib/time';
import { Icon, Modal } from '../components/ui';

/* Typed verbatim to unlock the erase button — no accidental clicks. */
const ERASE_PHRASE = 'erase everything';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

export function SettingsView() {
  const { settings, updateSettings, theme, setTheme, reset, items, blocks, sources, name, setName } =
    useStation();
  const s = settings;
  const [erasing, setErasing] = useState(false);
  const [phrase, setPhrase] = useState('');
  const confirmed = phrase.trim().toLowerCase() === ERASE_PHRASE;

  return (
    <div className="settings-page">
      <div className="page-head">
        <h1>Settings.</h1>
        <p>Add guardrails to your station. Change one preference and the whole schedule replans itself.</p>
      </div>

      <div className="grid" style={{ gap: 20 }}>
        <div className="card card-pad">
          <div className="section-head" style={{ marginBottom: 4 }}>
            <h2>You</h2>
          </div>
          <div className="field" style={{ maxWidth: 280 }}>
            <label htmlFor="s-name">Greeting name</label>
            <input
              id="s-name"
              className="input"
              value={name}
              placeholder="Jacob"
              autoComplete="given-name"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <h2>Appearance</h2>
          </div>
          <div className="row wrap">
            <button className="btn" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
              <Icon name="moon" size={13} /> Dark
            </button>
            <button className="btn" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
              <Icon name="sun" size={13} /> Light
            </button>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <h2>Your day</h2>
          </div>
          <div className="settings-grid">
            <div className="field">
              <label htmlFor="s-start">Earliest you'll work</label>
              <input
                id="s-start"
                className="input mono"
                type="time"
                value={toTime(s.dayStartMin)}
                onChange={(e) => updateSettings({ dayStartMin: fromTime(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="s-end">Latest you'll work</label>
              <input
                id="s-end"
                className="input mono"
                type="time"
                value={toTime(s.dayEndMin)}
                onChange={(e) => updateSettings({ dayEndMin: fromTime(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="s-cap">Max work per day</label>
              <input
                id="s-cap"
                className="input mono"
                type="number"
                min="30"
                step="30"
                value={s.dailyCapacityMin}
                onChange={(e) =>
                  updateSettings({ dailyCapacityMin: Math.max(30, Number(e.target.value) || 30) })
                }
              />
              <span className="hint">
                {durationLabel(s.dailyCapacityMin)} — stops the planner cramming everything into today.
              </span>
            </div>
          </div>
        </div>

        <div className="card card-pad day-card">
          <div className="section-head">
            <h2>Days off</h2>
          </div>
          <div className="day-toggles">
            {DAYS.map((label, i) => (
              <button
                key={i}
                className="day-toggle"
                aria-pressed={s.daysOff.includes(i)}
                aria-label={`Toggle day ${i}`}
                onClick={() =>
                  updateSettings({
                    daysOff: s.daysOff.includes(i) ? s.daysOff.filter((x) => x !== i) : [...s.daysOff, i],
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hint">Nothing gets scheduled on these. Deadlines still count.</span>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <h2>Focus blocks</h2>
          </div>
          <div className="settings-grid">
            <div className="field">
              <label htmlFor="s-focus">Longest block</label>
              <input
                id="s-focus"
                className="input mono"
                type="number"
                min="15"
                step="5"
                value={s.focusMin}
                onChange={(e) => updateSettings({ focusMin: Math.max(15, Number(e.target.value) || 25) })}
              />
            </div>
            <div className="field">
              <label htmlFor="s-min">Shortest worth scheduling</label>
              <input
                id="s-min"
                className="input mono"
                type="number"
                min="5"
                step="5"
                value={s.minBlockMin}
                onChange={(e) => updateSettings({ minBlockMin: Math.max(5, Number(e.target.value) || 15) })}
              />
            </div>
            <div className="field">
              <label htmlFor="s-break">Break between blocks</label>
              <input
                id="s-break"
                className="input mono"
                type="number"
                min="0"
                step="5"
                value={s.breakMin}
                onChange={(e) => updateSettings({ breakMin: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>
            <div className="field">
              <label htmlFor="s-commute">Buffer around classes</label>
              <input
                id="s-commute"
                className="input mono"
                type="number"
                min="0"
                step="5"
                value={s.commuteMin}
                onChange={(e) => updateSettings({ commuteMin: Math.max(0, Number(e.target.value) || 0) })}
              />
              <span className="hint">Getting there and back.</span>
            </div>
            <div className="field">
              <label htmlFor="s-horizon">Plan ahead (days)</label>
              <input
                id="s-horizon"
                className="input mono"
                type="number"
                min="3"
                max="60"
                value={s.horizonDays}
                onChange={(e) =>
                  updateSettings({ horizonDays: Math.min(60, Math.max(3, Number(e.target.value) || 14)) })
                }
              />
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <h2>Data</h2>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginBottom: 14 }}>
            Everything lives in this browser — {items.length} items and {blocks.length} scheduled blocks.
            Nothing is uploaded anywhere; imports go straight from your school's server to you.
          </p>
          <div className="row wrap">
            <button className="btn" onClick={() => download(useStation.getState())}>
              Export JSON
            </button>
            <button className="btn" onClick={() => updateSettings(DEFAULT_SETTINGS)}>
              Reset preferences
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                setPhrase('');
                setErasing(true);
              }}
            >
              <Icon name="trash" size={13} /> Erase everything
            </button>
          </div>
        </div>
      </div>

      {erasing && (
        <Modal title="Erase everything" onClose={() => setErasing(false)}>
          <div className="danger-hero">
            <span className="danger-mark">
              <Icon name="trash" size={20} />
            </span>
            <strong>Station on this browser</strong>
            <div className="danger-stats">
              <span>
                <Icon name="calendar" size={13} /> {items.length} items
              </span>
              <span>
                <Icon name="clock" size={13} /> {blocks.length} blocks
              </span>
              <span>
                <Icon name="link" size={13} /> {sources.length} sources
              </span>
            </div>
          </div>

          <div className="danger-confirm">
            <label htmlFor="erase-phrase">
              To confirm, type "{ERASE_PHRASE}" in the box below
            </label>
            <input
              id="erase-phrase"
              className="input input-danger"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              autoFocus
            />
            <button
              className="btn btn-danger btn-block"
              disabled={!confirmed}
              onClick={() => {
                reset();
                setErasing(false);
              }}
            >
              Erase everything
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function download(state: ReturnType<typeof useStation.getState>) {
  const payload = {
    exportedAt: new Date().toISOString(),
    sources: state.sources.map(({ token: _t, ...rest }) => rest), // never export credentials
    courses: state.courses,
    items: state.items,
    blocks: state.blocks,
    settings: state.settings,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `station-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
