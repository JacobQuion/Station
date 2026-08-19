import { useEffect, useState } from 'react';
import { useStation } from './store/useStation';
import { ImportView } from './views/Import';
import { View } from './views/View';
import { SettingsView } from './views/SettingsView';
import { Icon } from './components/ui';

type Tab = 'import' | 'view' | 'settings';

/** `step` is not shown; it maps the Cmd-1…Cmd-3 shortcuts onto the tabs. */
const TABS: Array<{ id: Tab; step: string; label: string; icon: string }> = [
  { id: 'import', step: '1', label: 'Import', icon: 'download' },
  { id: 'view', step: '2', label: 'View', icon: 'eye' },
  { id: 'settings', step: '3', label: 'Settings', icon: 'gear' },
];

export default function App() {
  const { onboarded, items, error, notice, dismiss, theme, replan } = useStation();
  const [tab, setTab] = useState<Tab>(onboarded ? 'view' : 'import');

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

  // ⌘1–⌘3 to move between the tabs.
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
              disabled={t.id === 'view' && !items.length}
            >
              <Icon name={t.icon} size={13} />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {tab === 'import' && <ImportView onDone={() => setTab('view')} />}
        {tab === 'view' && <View onGoImport={() => setTab('import')} />}
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
