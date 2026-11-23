import type { Project } from "../types";

interface ProjectDashboardProps {
  readonly projects: readonly Project[];
  readonly selectedProjectId: string | null;
  readonly onCreateProject: () => void;
  readonly onSelectProject: (project: Project) => void;
  readonly onDeleteProject?: (project: Project) => void;
}

export function ProjectDashboard({
  projects,
  selectedProjectId,
  onCreateProject,
  onSelectProject,
  onDeleteProject
}: ProjectDashboardProps) {
  return (
    <section className="sidebar-dashboard" aria-labelledby="projects-title">
      <header className="sidebar-projects-header">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <h1 id="projects-title">Projects</h1>
          <span className="count-pill" style={{ minHeight: "20px", padding: "1px 7px", fontSize: "10.5px" }}>
            {projects.length}편
          </span>
        </div>
        <button
          className="sidebar-mini-btn is-accent"
          onClick={onCreateProject}
          type="button"
          style={{ padding: "4px 9px" }}
        >
          + New Project
        </button>
      </header>

      <div className="project-list" role="list">
        {projects.length === 0 ? (
          <p className="empty-state" style={{ padding: "12px", fontSize: "12px" }}>
            No projects yet.
          </p>
        ) : (
          projects.map((project) => (
            <div
              key={project.project_id}
              className="project-list-row"
              role="listitem"
            >
              <button
                className="project-list-item"
                aria-current={project.project_id === selectedProjectId ? "page" : undefined}
                onClick={() => onSelectProject(project)}
                title={project.display_name}
                type="button"
              >
                <strong>{project.display_name}</strong>
                <span>{project.current_step}</span>
              </button>
              {onDeleteProject ? (
                <button
                  type="button"
                  className="project-delete-btn"
                  aria-label={`Delete ${project.display_name}`}
                  title="프로젝트 삭제"
                  onClick={() => onDeleteProject(project)}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
