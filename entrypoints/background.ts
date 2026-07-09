import {
  closeActiveProject,
  GET_ACTIVE_PROJECT_FOR_TAB_MESSAGE,
  getActiveProjectForTab,
  getProjectState,
  type ActiveProjectForTabResponse,
} from '@/lib/projects';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (message, sender) => {
    if (
      typeof message !== 'object' ||
      message == null ||
      !('type' in message) ||
      message.type !== GET_ACTIVE_PROJECT_FOR_TAB_MESSAGE
    ) {
      return undefined;
    }

    const response: ActiveProjectForTabResponse = {
      project: getActiveProjectForTab(await getProjectState(), sender.tab?.id),
    };

    return response;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void getProjectState().then((state) => {
      if (state.activeProjectTabId === tabId) {
        void closeActiveProject();
      }
    });
  });
});
