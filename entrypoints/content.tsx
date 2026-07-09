import React from 'react';
import ReactDOM from 'react-dom/client';

import { MacroPanel } from '@/components/macro-panel';
import { getPanelEnabled, PANEL_VISIBILITY_KEY } from '@/lib/panel-visibility';
import '@/styles/content.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'macro-master-panel',
      position: 'overlay',
      zIndex: 2147483647,
      isolateEvents: true,
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(
          <React.StrictMode>
            <MacroPanel />
          </React.StrictMode>,
        );

        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    if (await getPanelEnabled()) {
      ui.mount();
    }

    const handleStorageChange: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== 'local') return;

      const panelChange = changes[PANEL_VISIBILITY_KEY];
      if (!panelChange) return;

      if ((panelChange.newValue as boolean | undefined) ?? true) {
        ui.mount();
        return;
      }

      ui.remove();
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    ctx.onInvalidated(() => {
      browser.storage.onChanged.removeListener(handleStorageChange);
      ui.remove();
    });
  },
});
