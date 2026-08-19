import { useEffect, useState } from 'react';
import { useStation } from './store/useStation';
import { ImportView } from './views/Import';
import { Dashboard } from './views/Dashboard';
import { Focus } from './views/Focus';
import { SettingsView } from './views/SettingsView';
import { Icon } from './components/ui';

type Tab = 'import' | 'see' | 'do' | 'settings';

/** `step` is not shown; it maps the Cmd-1/2/3 shortcuts onto the three steps. */
const TABS: Array<{ id: Tab; step: string; label: string }> = [
  { id: 'import', step: '1', label: 'Import' },
  { id: 'see', step: '2', label: 'See' },
  { id: 'do', step: '3', label: 'Do' },
];

export default function App() {
  const { onboarded, items, error, notice, dismiss, theme, replan } = useStation();
  const [tab, setTab] = useState<Tab>(onboarded ? 'see' : 'import');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Toasts clear themselves so they never stack up.
  useEffect(() => {
    if (!error && !notice) return;
    const id = setTimeout(dismiss, error ? 8000 : 3200);
    return () => clearTimeout(id);
  }, [error, notice, dismiss]);

  // Re-check the plan when you come back to the tab — time moved while you were gone.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && useStation.getState().items.length) replan();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [replan]);

  // ⌘1/2/3 to move between the three steps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const hit = TABS.find((t) => t.step === e.key);
      if (hit) {
        e.preventDefault();
        setTab(hit.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="brand-text">Station</span>
        </div>

        <nav className="tabs" aria-label="Main">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="tab"
              aria-current={tab === t.id}
              onClick={() => setTab(t.id)}
              disabled={t.id !== 'import' && !items.length}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="spacer" />

        <button
          className="btn btn-ghost btn-sm"
          aria-current={tab === 'settings'}
          onClick={() => setTab('settings')}
          aria-label="Settings"
        >
          <Icon name="gear" size={15} />
        </button>
      </header>

      <main className="main">
        {tab === 'import' && <ImportView onDone={() => setTab('see')} />}
        {tab === 'see' && <Dashboard onGoFocus={() => setTab('do')} />}
        {tab === 'do' && <Focus onGoImport={() => setTab('import')} />}
        {tab === 'settings' && <SettingsView />}
      </main>

      <div className="toasts" role="status" aria-live="polite">
        {error && (
          <div className="toast toast-error">
            <Icon name="alert" />
            <span style={{ flex: 1 }}>{error}</span>
            <button className="btn btn-ghost btn-sm" onClick={dismiss} aria-label="Dismiss">
              <Icon name="x" size={13} />
            </button>
          </div>
        )}
        {notice && !error && (
          <div className="toast">
            <Icon name="check" />
            <span style={{ flex: 1 }}>{notice}</span>
          </div>
        )}
      </div>
    </div>
  );
}
