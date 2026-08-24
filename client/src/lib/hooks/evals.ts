/* hooks/evals.ts — React Query hooks for the Eval Pipeline (L06).
   Case CRUD, owner run (agent & skill), dashboard, and run history. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalCase,
  EvalCaseInput,
  EvalDashboard,
  EvalOwnerKind,
  EvalRunRecord,
  EvalRunResult,
  EvalVersionText,
} from "@devdigest/shared";

export interface EvalOwner {
  kind: EvalOwnerKind;
  id: string;
}

/** Cases for one owner (agent/skill). */
export function useEvalCases(owner: EvalOwner | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", owner?.kind, owner?.id],
    queryFn: () =>
      api.get<EvalCase[]>(
        `/evals/cases?owner_kind=${owner!.kind}&owner_id=${owner!.id}`,
      ),
    enabled: !!owner?.id,
  });
}

function invalidateOwner(qc: ReturnType<typeof useQueryClient>, owner: EvalOwner) {
  qc.invalidateQueries({ queryKey: ["eval-cases", owner.kind, owner.id] });
  qc.invalidateQueries({ queryKey: ["eval-runs", owner.kind, owner.id] });
  qc.invalidateQueries({ queryKey: ["eval-dashboard", owner.id] });
}

export function useCreateEvalCase(owner: EvalOwner) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>("/evals/cases", input),
    onSuccess: () => invalidateOwner(qc, owner),
  });
}

export function useUpdateEvalCase(owner: EvalOwner) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EvalCaseInput }) =>
      api.put<EvalCase>(`/evals/cases/${id}`, input),
    onSuccess: () => invalidateOwner(qc, owner),
  });
}

export function useDeleteEvalCase(owner: EvalOwner) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/evals/cases/${id}`),
    onSuccess: () => invalidateOwner(qc, owner),
  });
}

/** Run every case in an owner's set. `isPending` drives the in-flight row (AC-23). */
export function useRunEval(owner: EvalOwner) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<EvalRunResult[]>(`/${owner.kind}s/${owner.id}/eval-runs`),
    onSuccess: () => invalidateOwner(qc, owner),
  });
}

/**
 * Run a single persisted case (POST /evals/cases/:id/run) and return the
 * EvalRunRecord. Invalidates the owner's cases/runs/dashboard so the tab +
 * dashboard reflect the new run.
 */
export function useRunEvalCase(owner: EvalOwner) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) =>
      api.post<EvalRunRecord>(`/evals/cases/${caseId}/run`),
    onSuccess: () => invalidateOwner(qc, owner),
  });
}

/** Run-history list for an owner. */
export function useEvalRuns(owner: EvalOwner | null | undefined) {
  return useQuery({
    queryKey: ["eval-runs", owner?.kind, owner?.id],
    queryFn: () =>
      api.get<EvalRunRecord[]>(`/${owner!.kind}s/${owner!.id}/eval-runs`),
    enabled: !!owner?.id,
  });
}

/**
 * The owner's config snapshot text at a version — the agent system_prompt or
 * skill body — feeding the Compare modal's prompt/skill diff (AC-17). Skips the
 * fetch when the version is null (a run with no version stamp).
 */
export function useEvalVersionText(
  ownerId: string | null | undefined,
  version: number | null | undefined,
) {
  return useQuery({
    queryKey: ["eval-version-text", ownerId, version],
    queryFn: () =>
      api.get<EvalVersionText>(`/eval/${ownerId}/version-text?version=${version}`),
    enabled: !!ownerId && version != null,
  });
}

/** Per-owner dashboard aggregate. */
export function useEvalDashboard(ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-dashboard", ownerId],
    queryFn: () => api.get<EvalDashboard>(`/eval/${ownerId}`),
    enabled: !!ownerId,
  });
}
