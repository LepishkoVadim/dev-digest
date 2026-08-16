"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Markdown, Skeleton, type Crumb } from "@devdigest/ui";
import type { DocListItem } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { useActiveRepo } from "../../../../lib/repo-context";
import { useRepoDocs, useRescanDocs, useDocPreview } from "../../../../lib/hooks/docs";
import { splitDocPath } from "../../../../lib/doc-badge";
import { s } from "./styles";

/** Format an ISO timestamp as a short "Nm ago" relative time (footer). */
function scannedAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

/**
 * Project Context reader (Step 9). Renders INSIDE the AppShell (nav sidebar + top
 * breadcrumb) like every other route. Lists the selected repo's `.md` docs in a
 * left column, previews a selected doc read-only on the right, shows "Used by N
 * agents", and a footer with the file count + last-scanned time. No
 * chunk/coverage/index metric; no authoring control (read-only).
 */
export function ProjectContextView() {
  const t = useTranslations("context");
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const { data, isLoading, isError, refetch } = useRepoDocs(repoId);
  const rescan = useRescanDocs();
  const [selected, setSelected] = React.useState<string | null>(null);

  const docs = data?.docs ?? [];
  const selectedDoc = docs.find((d) => d.path === selected) ?? null;
  const preview = useDocPreview(repoId, selectedDoc ? selectedDoc.path : null);

  const crumb: Crumb[] = [
    { label: activeRepo?.full_name ?? repoId ?? "—", mono: true },
    { label: t("breadcrumb") },
  ];

  if (reposLoaded && !repoId) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState icon="Folder" title={t("noRepo.title")} body={t("noRepo.body")} />
      </AppShell>
    );
  }
  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState title={t("loadError.title")} body={t("loadError.body")} onRetry={() => refetch()} fullScreen />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        {/* Left column: label + root hint + rescan, scrollable list, footer. */}
        <aside style={s.list}>
          <div style={s.listHead}>
            <div style={s.listLabelRow}>
              <span style={s.listLabel}>{t("listLabel")}</span>
              <Button
                icon="RefreshCw"
                kind="ghost"
                size="sm"
                loading={rescan.isPending}
                disabled={!repoId}
                onClick={() => repoId && rescan.mutate(repoId)}
                aria-label={t("rescan")}
              />
            </div>
            <p style={s.listPath}>{t("subtitle")}</p>
          </div>

          <div style={s.listScroll}>
            {isLoading ? (
              <>
                <Skeleton height={36} />
                <Skeleton height={36} />
                <Skeleton height={36} />
              </>
            ) : docs.length === 0 ? (
              <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body")} />
            ) : (
              docs.map((doc: DocListItem) => {
                const { name } = splitDocPath(doc.path);
                const active = doc.path === selected;
                return (
                  <button
                    key={doc.path}
                    type="button"
                    style={s.row(active)}
                    onClick={() => setSelected(doc.path)}
                    aria-pressed={active}
                    title={doc.path}
                  >
                    <Icon.FileText size={15} aria-hidden />
                    <span className="mono" style={s.rowName}>{name}</span>
                  </button>
                );
              })
            )}
          </div>

          {data && (
            <div style={s.footer}>
              {t("footer", { count: docs.length, when: scannedAgo(data.scanned_at) })}
            </div>
          )}
        </aside>

        {/* Right column: read-only preview of the selected doc. */}
        <section style={s.preview}>
          {!selectedDoc ? (
            <p style={s.placeholder}>{t("selectPrompt")}</p>
          ) : (
            <>
              <div style={s.previewHead}>
                <span className="mono" style={s.previewPath} title={selectedDoc.path}>
                  {selectedDoc.path}
                </span>
                <span style={s.previewLabel}>{t("preview")}</span>
                <Badge icon="Cpu" color="var(--text-secondary)">
                  {t("usedByAgents", { count: selectedDoc.used_by_agents })}
                </Badge>
              </div>
              <div style={s.previewBody}>
                {preview.isLoading ? (
                  <Skeleton height={120} />
                ) : preview.isError ? (
                  <ErrorState body={t("loadError.body")} onRetry={() => preview.refetch()} />
                ) : (
                  <Markdown>{preview.data?.body ?? ""}</Markdown>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
