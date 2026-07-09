import { useEffect, useState } from 'react';

import {
  ACTIVE_PROJECT_ID_KEY,
  ACTIVE_PROJECT_TAB_ID_KEY,
  createProjectAndOpen,
  getProjectState,
  openProject,
  type ProjectState,
  PROJECTS_KEY,
} from '@/lib/projects';

const EMPTY_STATE: ProjectState = {
  projects: [],
  activeProjectId: null,
  activeProjectTabId: null,
};

type PopupTabInfo = {
  id: number;
  index: number;
  number: number;
  windowId: number;
};

async function getCurrentTabInfo(): Promise<PopupTabInfo | null> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (tab?.id == null) {
    return null;
  }

  return {
    id: tab.id,
    index: tab.index,
    number: tab.index + 1,
    windowId: tab.windowId,
  };
}

async function getTabInfo(tabId: number): Promise<PopupTabInfo | null> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.id == null) {
      return null;
    }

    return {
      id: tab.id,
      index: tab.index,
      number: tab.index + 1,
      windowId: tab.windowId,
    };
  } catch {
    return null;
  }
}

function formatRelativeTabPosition(fromTab: PopupTabInfo, toTab: PopupTabInfo) {
  if (fromTab.windowId !== toTab.windowId) {
    return null;
  }

  const offset = toTab.index - fromTab.index;
  if (offset === 0) {
    return null;
  }

  const count = Math.abs(offset);
  const noun = count === 1 ? 'tab' : 'tabs';
  const direction = offset > 0 ? 'right' : 'left';

  return `${count} ${noun} ${direction}`;
}

function App() {
  const [state, setState] = useState<ProjectState>(EMPTY_STATE);
  const [currentTab, setCurrentTab] = useState<PopupTabInfo | null>(null);
  const [activeProjectTab, setActiveProjectTab] =
    useState<PopupTabInfo | null>(null);
  const [projectName, setProjectName] = useState('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const syncProjects = async () => {
      const [nextState, nextTab] = await Promise.all([
        getProjectState(),
        getCurrentTabInfo(),
      ]);
      const nextActiveProjectTab =
        nextState.activeProjectTabId == null
          ? null
          : await getTabInfo(nextState.activeProjectTabId);
      if (!isMounted) return;

      setState(nextState);
      setCurrentTab(nextTab);
      setActiveProjectTab(nextActiveProjectTab);
      setIsReady(true);
    };

    void syncProjects();

    const handleStorageChange: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== 'local') return;

      if (
        changes[PROJECTS_KEY] ||
        changes[ACTIVE_PROJECT_ID_KEY] ||
        changes[ACTIVE_PROJECT_TAB_ID_KEY]
      ) {
        void syncProjects();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      isMounted = false;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleCreateProject = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!projectName.trim() || currentTab == null) return;

    await createProjectAndOpen(projectName, currentTab.id);
    setProjectName('');
  };

  const getProjectStatus = (projectId: string) => {
    if (projectId !== state.activeProjectId) {
      return 'Closed';
    }

    if (state.activeProjectTabId == null || activeProjectTab == null) {
      return 'Other tab';
    }

    if (state.activeProjectTabId === currentTab?.id) {
      return 'Active';
    }

    if (currentTab != null && currentTab.windowId !== activeProjectTab.windowId) {
      return 'Other window';
    }

    const relativePosition =
      currentTab == null
        ? null
        : formatRelativeTabPosition(currentTab, activeProjectTab);

    if (!relativePosition) {
      return 'Other tab';
    }

    return `Tab #${activeProjectTab.number}, ${relativePosition}`;
  };

  return (
    <main className="popup-shell">
      <div>
        <p className="eyebrow">MacroMaster</p>
        <h1>Projects</h1>
      </div>

      <form className="project-form" onSubmit={handleCreateProject}>
        <label className="field-label" htmlFor="project-name">
          New project
        </label>
        <div className="create-row">
          <input
            autoComplete="off"
            className="project-input"
            disabled={!isReady}
            id="project-name"
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Project name"
            type="text"
            value={projectName}
          />
          <button
            className="primary-button"
            disabled={!isReady || currentTab == null || !projectName.trim()}
            type="submit"
          >
            Create
          </button>
        </div>
      </form>

      <section className="projects-section" aria-label="Existing projects">
        <div className="table-header">
          <span>Name</span>
          <span>Status</span>
        </div>
        <div className="project-table" role="list">
          {state.projects.length === 0 ? (
            <p className="empty-state">No projects yet</p>
          ) : (
            state.projects.map((project) => {
              const isActive = project.id === state.activeProjectId;
              const status = getProjectStatus(project.id);
              const currentTabId = currentTab?.id;

              return (
                <button
                  className="project-row"
                  disabled={!isReady || currentTabId == null}
                  key={project.id}
                  onClick={() => {
                    if (currentTabId == null) return;

                    void openProject(project.id, currentTabId);
                  }}
                  role="listitem"
                  type="button"
                >
                  <span className="project-name">{project.name}</span>
                  <span className={isActive ? 'status active' : 'status'}>
                    {status}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
