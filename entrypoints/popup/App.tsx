import { useEffect, useState } from 'react';

import {
  ACTIVE_PROJECT_ID_KEY,
  createProjectAndOpen,
  getProjectState,
  openProject,
  type ProjectState,
  PROJECTS_KEY,
} from '@/lib/projects';

const EMPTY_STATE: ProjectState = {
  projects: [],
  activeProjectId: null,
};

function App() {
  const [state, setState] = useState<ProjectState>(EMPTY_STATE);
  const [projectName, setProjectName] = useState('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const syncProjects = async () => {
      const nextState = await getProjectState();
      if (!isMounted) return;

      setState(nextState);
      setIsReady(true);
    };

    void syncProjects();

    const handleStorageChange: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== 'local') return;

      if (changes[PROJECTS_KEY] || changes[ACTIVE_PROJECT_ID_KEY]) {
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

    if (!projectName.trim()) return;

    await createProjectAndOpen(projectName);
    setProjectName('');
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
            disabled={!isReady || !projectName.trim()}
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

              return (
                <button
                  className="project-row"
                  disabled={!isReady}
                  key={project.id}
                  onClick={() => void openProject(project.id)}
                  role="listitem"
                  type="button"
                >
                  <span className="project-name">{project.name}</span>
                  <span className={isActive ? 'status active' : 'status'}>
                    {isActive ? 'Open' : 'Closed'}
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
