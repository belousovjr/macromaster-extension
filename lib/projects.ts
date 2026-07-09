export const PROJECTS_KEY = 'macroMasterProjects';
export const ACTIVE_PROJECT_ID_KEY = 'macroMasterActiveProjectId';

export type MacroProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectStorageState = {
  [PROJECTS_KEY]?: MacroProject[];
  [ACTIVE_PROJECT_ID_KEY]?: string | null;
};

export type ProjectState = {
  projects: MacroProject[];
  activeProjectId: string | null;
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

export async function getProjectState(): Promise<ProjectState> {
  const state = (await browser.storage.local.get([
    PROJECTS_KEY,
    ACTIVE_PROJECT_ID_KEY,
  ])) as ProjectStorageState;
  const projects = state[PROJECTS_KEY] ?? [];
  const activeProjectId = state[ACTIVE_PROJECT_ID_KEY] ?? null;

  return {
    projects,
    activeProjectId: projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : null,
  };
}

export async function createProjectAndOpen(name: string) {
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
  });

  return project;
}

export async function openProject(projectId: string) {
  await browser.storage.local.set({ [ACTIVE_PROJECT_ID_KEY]: projectId });
}

export async function closeActiveProject() {
  await browser.storage.local.set({ [ACTIVE_PROJECT_ID_KEY]: null });
}
