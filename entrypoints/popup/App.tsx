import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ACTIVE_PROJECT_ID_KEY,
  ACTIVE_PROJECT_TAB_ID_KEY,
  createProjectAndOpen,
  getProjectState,
  openProject,
  type ProjectState,
  PROJECTS_KEY,
} from '@/lib/projects';
import { cn } from '@/lib/utils';

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
  const noun = count === 1 ? 'вкладку' : count < 5 ? 'вкладки' : 'вкладок';
  const direction = offset > 0 ? 'справа' : 'слева';

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
      return 'Закрыт';
    }

    if (state.activeProjectTabId == null || activeProjectTab == null) {
      return 'Другая вкладка';
    }

    if (state.activeProjectTabId === currentTab?.id) {
      return 'Активен';
    }

    if (currentTab != null && currentTab.windowId !== activeProjectTab.windowId) {
      return 'Другое окно';
    }

    const relativePosition =
      currentTab == null
        ? null
        : formatRelativeTabPosition(currentTab, activeProjectTab);

    if (!relativePosition) {
      return 'Другая вкладка';
    }

    return `Вкладка #${activeProjectTab.number}, ${relativePosition}`;
  };

  return (
    <main className="macro-master-popup grid w-[420px] gap-4 bg-background p-[18px] text-foreground">
      <div>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          MacroMaster
        </p>
        <h1 className="text-xl font-semibold leading-tight">Проекты</h1>
      </div>

      <form className="grid gap-2" onSubmit={handleCreateProject}>
        <label
          className="text-xs font-semibold text-muted-foreground"
          htmlFor="project-name"
        >
          Новый проект
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            autoComplete="off"
            disabled={!isReady}
            id="project-name"
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Название проекта"
            type="text"
            value={projectName}
          />
          <Button
            disabled={!isReady || currentTab == null || !projectName.trim()}
            type="submit"
          >
            Создать
          </Button>
        </div>
      </form>

      <section
        className="overflow-hidden rounded-lg border border-border bg-card"
        aria-label="Существующие проекты"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          <span>Название</span>
          <span>Статус</span>
        </div>
        <div className="max-h-[220px] overflow-y-auto" role="list">
          {state.projects.length === 0 ? (
            <p className="m-0 px-3 py-6 text-center text-sm text-muted-foreground">
              Проектов пока нет
            </p>
          ) : (
            state.projects.map((project) => {
              const isActive = project.id === state.activeProjectId;
              const status = getProjectStatus(project.id);
              const currentTabId = currentTab?.id;

              return (
                <button
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-0 border-b border-border bg-transparent px-3 py-3 text-left text-foreground transition-colors last:border-b-0 hover:bg-accent disabled:cursor-wait disabled:opacity-70"
                  disabled={!isReady || currentTabId == null}
                  key={project.id}
                  onClick={() => {
                    if (currentTabId == null) return;

                    void openProject(project.id, currentTabId);
                  }}
                  role="listitem"
                  type="button"
                >
                  <span className="min-w-0 truncate text-sm font-semibold leading-tight">
                    {project.name}
                  </span>
                  <Badge
                    className={cn(
                      'max-w-[190px] truncate',
                      isActive && 'bg-primary text-primary-foreground',
                    )}
                    variant={isActive ? 'default' : 'secondary'}
                  >
                    {status}
                  </Badge>
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
