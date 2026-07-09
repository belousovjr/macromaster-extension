import React from 'react';
import ReactDOM from 'react-dom/client';
import type { Root } from 'react-dom/client';

import { MacroPanel } from '@/components/macro-panel';
import {
  ACTIVE_PROJECT_ID_KEY,
  getActiveProject,
  getProjectState,
  type MacroProject,
  PROJECTS_KEY,
} from '@/lib/projects';
import '@/styles/content.css';

type MountedPanel = {
  root: Root;
  render: (project: MacroProject) => void;
};

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
        const render = (project: MacroProject) => {
          root.render(
            <React.StrictMode>
              <MacroPanel project={project} />
            </React.StrictMode>,
          );
        };

        return { root, render } satisfies MountedPanel;
      },
      onRemove(mounted) {
        mounted?.root.unmount();
      },
    });

    const syncPanel = async () => {
      const activeProject = getActiveProject(await getProjectState());

      if (!activeProject) {
        ui.remove();
        return;
      }

      ui.mount();
      ui.mounted?.render(activeProject);
    };

    await syncPanel();

    const handleStorageChange: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== 'local') return;

      if (changes[ACTIVE_PROJECT_ID_KEY] || changes[PROJECTS_KEY]) {
        void syncPanel();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    ctx.onInvalidated(() => {
      browser.storage.onChanged.removeListener(handleStorageChange);
      ui.remove();
    });
  },
});
