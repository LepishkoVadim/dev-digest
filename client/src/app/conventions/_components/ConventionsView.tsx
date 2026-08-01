/* /conventions — Conventions Extractor. Run analysis on the active repo, review
   candidates (each grounded in real code), accept/reject/edit, then merge the
   accepted ones into a reusable skill. */
"use client";

import React from "react";
import { Button, EmptyState, ErrorState, Skeleton, Icon, ProgressBar, Badge } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { useActiveRepo } from "../../../lib/repo-context";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "../../../lib/hooks/conventions";
import type { ConventionCandidate, Repo } from "@devdigest/shared";
import { CreateSkillModal } from "./CreateSkillModal";
import { githubEvidenceUrl } from "./helpers";
import { Textarea, FormField } from "@devdigest/ui";
import { s } from "./styles";

export function ConventionsView() {
  const { activeRepo, reposLoaded } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const [creating, setCreating] = React.useState(false);

  const list = candidates ?? [];
  const accepted = list.filter((c) => c.accepted);

  if (reposLoaded && !activeRepo) {
    return (
      <AppShell crumb={[{ label: "Skills Lab" }, { label: "Conventions" }]}>
        <div style={s.page}>
          <EmptyState icon="ListChecks" title="No repo selected" body="Pick a repository from the switcher to extract its conventions." />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: "Skills Lab" }, { label: "Conventions" }]}>
      {creating && activeRepo && (
        <CreateSkillModal repo={activeRepo} accepted={accepted} onClose={() => setCreating(false)} />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              Conventions in <span style={s.accent}>{activeRepo ? activeRepo.name : "…"}</span>
            </h1>
            <div style={s.sub}>
              Sampled from configs + top-ranked files, then each rule is verified against real code.
            </div>
          </div>
          <Button
            kind="secondary"
            icon="RefreshCw"
            loading={extract.isPending}
            disabled={extract.isPending || !repoId}
            onClick={() => extract.mutate()}
          >
            {list.length ? "Re-scan" : "Run analysis"}
          </Button>
        </div>

        {extract.isError && (
          <div style={{ marginTop: 14 }}>
            <ErrorState body={(extract.error as Error)?.message ?? "Extraction failed."} onRetry={() => extract.mutate()} />
          </div>
        )}

        <div style={s.toolbar}>
          <span style={s.count}>
            {accepted.length} of {list.length} accepted
          </span>
          <span style={s.spacer} />
          <Button
            kind="primary"
            icon="Sparkles"
            disabled={accepted.length === 0}
            onClick={() => setCreating(true)}
          >
            Create skill
          </Button>
        </div>

        {(isLoading || extract.isPending) && (
          <div style={s.grid}>
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        )}
        {isError && <ErrorState body="Could not load conventions." onRetry={() => refetch()} />}
        {!isLoading && !extract.isPending && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title="No conventions yet"
            body="Run the analysis to detect house conventions in this repository."
            cta="Run analysis"
            onCta={() => extract.mutate()}
          />
        )}
        {!extract.isPending && list.length > 0 && (
          <div style={s.grid}>
            {list.map((c) => (
              <ConventionCard key={c.id} candidate={c} repo={activeRepo!} repoId={repoId} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ConventionCard({
  candidate,
  repo,
  repoId,
}: {
  candidate: ConventionCandidate;
  repo: Repo;
  repoId: string | null;
}) {
  const update = useUpdateConvention(repoId);
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [snippet, setSnippet] = React.useState(candidate.evidence_snippet);
  const pct = Math.round(candidate.confidence * 100);
  const loc = candidate.evidence_line
    ? `${candidate.evidence_path}:${candidate.evidence_line}`
    : candidate.evidence_path;

  const save = async () => {
    await update.mutateAsync({ id: candidate.id, patch: { rule, evidence_snippet: snippet } });
    setEditing(false);
  };

  return (
    <div style={s.card}>
      <div style={s.cardBody}>
        {editing ? (
          <div style={s.editRow}>
            <FormField label="Rule">
              <Textarea value={rule} onChange={setRule} rows={2} />
            </FormField>
            <FormField label="Evidence snippet">
              <Textarea value={snippet} onChange={setSnippet} rows={3} mono />
            </FormField>
          </div>
        ) : (
          <div style={s.rule}>{candidate.rule}</div>
        )}

        <div style={s.evidenceBox}>
          <div style={s.evidenceHead}>
            <a
              style={s.evidenceLink}
              href={githubEvidenceUrl(repo, candidate)}
              target="_blank"
              rel="noreferrer"
              className="mono"
            >
              <Icon.ExternalLink size={12} />
              {loc}
            </a>
          </div>
          <pre style={s.snippet} className="mono">
            {candidate.evidence_snippet}
          </pre>
        </div>

        <div style={s.confRow}>
          <span style={s.confLabel}>Confidence</span>
          <div style={s.confBar}>
            <ProgressBar value={pct} color={pct >= 80 ? "var(--ok)" : "var(--warn)"} height={6} />
          </div>
          <span style={s.confPct}>{pct}%</span>
          {candidate.accepted && (
            <Badge color="var(--ok)" bg="color-mix(in srgb, var(--ok) 15%, transparent)">
              accepted
            </Badge>
          )}
        </div>
      </div>

      <div style={s.actions}>
        {editing ? (
          <>
            <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={update.isPending}>
              Save
            </Button>
            <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              kind={candidate.accepted ? "primary" : "secondary"}
              size="sm"
              icon="Check"
              onClick={() => update.mutate({ id: candidate.id, patch: { accepted: true } })}
              disabled={update.isPending}
            >
              {candidate.accepted ? "Accepted" : "Accept"}
            </Button>
            <Button
              kind={!candidate.accepted ? "danger" : "ghost"}
              size="sm"
              icon="X"
              onClick={() => update.mutate({ id: candidate.id, patch: { accepted: false } })}
              disabled={update.isPending}
            >
              Reject
            </Button>
            <Button kind="ghost" size="sm" icon="Edit" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
