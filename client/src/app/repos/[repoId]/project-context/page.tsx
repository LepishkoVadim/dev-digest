"use client";

import { useParams } from "next/navigation";
import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/project-context (WORKSPACE nav item). Repo-scoped like
   /repos/:repoId/pulls — :repoId is explicit in the URL, read here and passed
   down, rather than resolved implicitly from the active-repo context. Thin
   entry; the reader view is colocated under _components/ProjectContextView. */
export default function ProjectContextPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ProjectContextView repoId={repoId} />;
}
