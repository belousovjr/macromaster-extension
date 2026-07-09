export const PANEL_VISIBILITY_KEY = 'macroMasterPanelEnabled';
export const DEFAULT_PANEL_ENABLED = true;

type PanelVisibilityState = {
  [PANEL_VISIBILITY_KEY]?: boolean;
};

export async function getPanelEnabled() {
  const state = (await browser.storage.local.get(
    PANEL_VISIBILITY_KEY,
  )) as PanelVisibilityState;

  return state[PANEL_VISIBILITY_KEY] ?? DEFAULT_PANEL_ENABLED;
}

export async function setPanelEnabled(enabled: boolean) {
  await browser.storage.local.set({ [PANEL_VISIBILITY_KEY]: enabled });
}

