/* hooks/docs.ts — React Query hooks for Project Context docs (list, rescan,
   preview). The doc list is scoped to the active repo; preview fetches raw
   markdown for the read-only viewer. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { DocList } from "@devdigest/shared";

/** List `.md` docs found in the repo's clone under the configured roots. */
export function useRepoDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["docs", repoId],
    queryFn: () => api.get<DocList>(`/repos/${repoId}/docs`),
    enabled: !!repoId,
  });
}

/** Rescan = re-walk the clone; refreshes the list + last-scanned time. */
export function useRescanDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<DocList>(`/repos/${repoId}/docs/rescan`),
    onSuccess: (data, repoId) => qc.setQueryData(["docs", repoId], data),
  });
}

/** Raw markdown body for the read-only Preview (containment-checked server-side). */
export function useDocPreview(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["doc-preview", repoId, path],
    queryFn: () =>
      api.get<{ path: string; body: string }>(
        `/repos/${repoId}/docs/preview/${path}`,
      ),
    enabled: !!repoId && !!path,
  });
}
