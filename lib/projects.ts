export const PROJECTS_KEY = 'macroMasterProjects';
export const ACTIVE_PROJECT_ID_KEY = 'macroMasterActiveProjectId';
export const ACTIVE_PROJECT_TAB_ID_KEY = 'macroMasterActiveProjectTabId';
export const GET_ACTIVE_PROJECT_FOR_TAB_MESSAGE =
  'macroMaster:getActiveProjectForTab';

export type MacroProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectStorageState = {
  [PROJECTS_KEY]?: MacroProject[];
  [ACTIVE_PROJECT_ID_KEY]?: string | null;
  [ACTIVE_PROJECT_TAB_ID_KEY]?: number | null;
};

export type ProjectState = {
  projects: MacroProject[];
  activeProjectId: string | null;
  activeProjectTabId: number | null;
};

export type ActiveProjectForTabResponse = {
  project: MacroProject | null;
};

export function createProjectId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeProjectName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export function getActiveProject(state: ProjectState) {
  return (
    state.projects.find((project) => project.id === state.activeProjectId) ??
    null
  );
}

export function getActiveProjectForTab(state: ProjectState, tabId?: number) {
  if (tabId == null || state.activeProjectTabId !== tabId) {
    return null;
  }

  return getActiveProject(state);
}

export async function getProjectState(): Promise<ProjectState> {
  const state = (await browser.storage.local.get([
    PROJECTS_KEY,
    ACTIVE_PROJECT_ID_KEY,
    ACTIVE_PROJECT_TAB_ID_KEY,
  ])) as ProjectStorageState;
  const projects = state[PROJECTS_KEY] ?? [];
  const activeProjectId = state[ACTIVE_PROJECT_ID_KEY] ?? null;
  const activeProjectTabId = state[ACTIVE_PROJECT_TAB_ID_KEY] ?? null;
  const hasActiveProject = projects.some(
    (project) => project.id === activeProjectId,
  );

  return {
    projects,
    activeProjectId: hasActiveProject ? activeProjectId : null,
    activeProjectTabId: hasActiveProject ? activeProjectTabId : null,
  };
}

export async function createProjectAndOpen(name: string, tabId: number) {
  const normalizedName = normalizeProjectName(name);
  if (!normalizedName) {
    throw new Error('Project name is required');
  }

  const state = await getProjectState();
  const now = new Date().toISOString();
  const project: MacroProject = {
    id: createProjectId(),
    name: normalizedName,
    createdAt: now,
    updatedAt: now,
  };

  await browser.storage.local.set({
    [PROJECTS_KEY]: [project, ...state.projects],
    [ACTIVE_PROJECT_ID_KEY]: project.id,
    [ACTIVE_PROJECT_TAB_ID_KEY]: tabId,
  });

  return project;
}

export async function openProject(projectId: string, tabId: number) {
  await browser.storage.local.set({
    [ACTIVE_PROJECT_ID_KEY]: projectId,
    [ACTIVE_PROJECT_TAB_ID_KEY]: tabId,
  });
}

export async function closeActiveProject() {
  await browser.storage.local.set({
    [ACTIVE_PROJECT_ID_KEY]: null,
    [ACTIVE_PROJECT_TAB_ID_KEY]: null,
  });
}
