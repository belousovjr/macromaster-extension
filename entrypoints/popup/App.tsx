import { useEffect, useState } from 'react';

import {
  DEFAULT_PANEL_ENABLED,
  getPanelEnabled,
  PANEL_VISIBILITY_KEY,
  setPanelEnabled,
} from '@/lib/panel-visibility';

function App() {
  const [enabled, setEnabled] = useState(DEFAULT_PANEL_ENABLED);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getPanelEnabled().then((storedEnabled) => {
      if (!isMounted) return;

      setEnabled(storedEnabled);
      setIsReady(true);
    });

    const handleStorageChange: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== 'local') return;

      const panelChange = changes[PANEL_VISIBILITY_KEY];
      if (!panelChange) return;

      setEnabled(
        (panelChange.newValue as boolean | undefined) ?? DEFAULT_PANEL_ENABLED,
      );
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      isMounted = false;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const togglePanel = async () => {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    await setPanelEnabled(nextEnabled);
  };

  return (
    <main className="popup-shell">
      <div>
        <p className="eyebrow">MacroMaster</p>
        <h1>Side panel</h1>
      </div>

      <button
        aria-checked={enabled}
        className="toggle-row"
        disabled={!isReady}
        onClick={togglePanel}
        role="switch"
        type="button"
      >
        <span>
          <span className="toggle-title">Show on pages</span>
          <span className="toggle-status">{enabled ? 'Enabled' : 'Disabled'}</span>
        </span>
        <span className="switch-track" data-state={enabled ? 'checked' : 'unchecked'}>
          <span className="switch-thumb" />
        </span>
      </button>
    </main>
  );
}

export default App;
