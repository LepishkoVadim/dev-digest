/* hooks/smart-diff.ts — risk-ordered file grouping for the Files changed tab.
   Deterministic (no LLM); recomputed server-side from the PR's files + latest
   review findings. Invalidated by the review mutations in hooks/reviews.ts. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
