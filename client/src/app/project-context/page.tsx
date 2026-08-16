import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /project-context (WORKSPACE nav item, reuses nav.ts:27). Thin entry —
   the reader view, its list/preview panes, styles and i18n are colocated under
   _components/ProjectContextView. Read-only (attach happens in the editors). */
export default function ProjectContextPage() {
  return <ProjectContextView />;
}
