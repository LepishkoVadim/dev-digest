/* hooks/blast.ts — Blast Radius for a PR (deterministic, index-only; no LLM).
   Read straight from the repo-intel index on the server; recomputed cheaply per
   request, so a short staleTime is fine. Mirrors hooks/smart-diff.ts. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastReport } from "@devdigest/shared";

export function useBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastReport>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
