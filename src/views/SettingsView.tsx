import { DEFAULT_SETTINGS, useStation } from '../store/useStation';
import { durationLabel } from '../lib/time';
import { Icon } from '../components/ui';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

export function SettingsView() {
  const { settings, updateSettings, theme, setTheme, reset, items, blocks } = useStation();
  const s = settings;

  return (
    <>
      <div className="page-head">
        <h1>How you work.</h1>
        <p>
          These constraints are what the planner schedules inside of. Change one and the whole plan rebuilds.
        </p>
      </div>

      <div className="grid" style={{ gap: 20, maxWidth: 780 }}>
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

          <div className="field" style={{ marginTop: 16 }}>
            <label>Days off</label>
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
                if (confirm('Erase every imported item, source and plan from this browser?')) reset();
              }}
            >
              <Icon name="trash" size={13} /> Erase everything
            </button>
          </div>
        </div>
      </div>
    </>
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
