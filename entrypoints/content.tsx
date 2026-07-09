import React from 'react';
import ReactDOM from 'react-dom/client';
import type { Root } from 'react-dom/client';

import { MacroPanel } from '@/components/macro-panel';
import { createTabMarker } from '@/lib/tab-marker';
import {
  ACTIVE_PROJECT_ID_KEY,
  ACTIVE_PROJECT_TAB_ID_KEY,
  GET_ACTIVE_PROJECT_FOR_TAB_MESSAGE,
  type ActiveProjectForTabResponse,
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
    const tabMarker = createTabMarker();
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
      const response =
        (await browser.runtime.sendMessage({
          type: GET_ACTIVE_PROJECT_FOR_TAB_MESSAGE,
        })) as ActiveProjectForTabResponse;
      const activeProject = response.project;

      if (!activeProject) {
        ui.remove();
        tabMarker.disable();
        return;
      }

      tabMarker.enable();
      ui.mount();
      ui.mounted?.render(activeProject);
    };

    await syncPanel();

    const handleStorageChange: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== 'local') return;

      if (
        changes[ACTIVE_PROJECT_ID_KEY] ||
        changes[ACTIVE_PROJECT_TAB_ID_KEY] ||
        changes[PROJECTS_KEY]
      ) {
        void syncPanel();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    ctx.onInvalidated(() => {
      browser.storage.onChanged.removeListener(handleStorageChange);
      tabMarker.disable();
      ui.remove();
    });
  },
});
