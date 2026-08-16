"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, EmptyState, ErrorState, Icon, Markdown, Skeleton, TextInput } from "@devdigest/ui";
import type { DocListItem } from "@devdigest/shared";
import { useActiveRepo } from "../../lib/repo-context";
import { useRepoDocs, useDocPreview } from "../../lib/hooks/docs";
import { DOC_TYPE_ICON, DOC_TYPE_COLOR, splitDocPath } from "../../lib/doc-badge";
import { s } from "./styles";

/**
 * Shared doc attach/detach/reorder list for the agent Context tab and skill
 * Context section. Rows show a drag handle, attach checkbox, filename + path
 * prefix, doc-type badge, per-doc token count, and Preview. Attached docs sort
 * first in stored (injection) order; the rest follow.
 *
 * Save-on-change: every attach/detach/reorder calls `onChange(nextPaths)`. Both
 * mouse drag AND keyboard (ArrowUp/Down while a handle is focused) reorder — the
 * order is load-bearing, so it must be reachable without a mouse (NFR-4).
 */
export function DocAttachList({
  attached,
  onChange,
}: {
  attached: string[];
  onChange: (paths: string[]) => void;
}) {
  const t = useTranslations("context");
  const { repoId } = useActiveRepo();
  const { data } = useRepoDocs(repoId);
  const docs = React.useMemo(() => data?.docs ?? [], [data]);

  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const preview = useDocPreview(repoId, previewPath);

  const attachedSet = React.useMemo(() => new Set(attached), [attached]);
  const byPath = React.useMemo(() => new Map(docs.map((d) => [d.path, d])), [docs]);

  const toggle = (path: string) => {
    onChange(attachedSet.has(path) ? attached.filter((p) => p !== path) : [...attached, path]);
  };

  const move = (path: string, dir: -1 | 1) => {
    const i = attached.indexOf(path);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= attached.length) return;
    const next = [...attached];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  const onDragEnter = (targetPath: string) => {
    if (!dragPath || dragPath === targetPath || !attachedSet.has(targetPath)) return;
    const next = attached.filter((p) => p !== dragPath);
    next.splice(next.indexOf(targetPath), 0, dragPath);
    onChange(next);
  };

  // Attached first (in stored order), then the rest.
  const attachedDocs = attached.map((p) => byPath.get(p)).filter((x): x is DocListItem => !!x);
  const rest = docs.filter((d) => !attachedSet.has(d.path));
  const q = filter.trim().toLowerCase();
  const visible = [...attachedDocs, ...rest].filter((d) => !q || d.path.toLowerCase().includes(q));

  if (!repoId) return <p style={s.hint}>{t("attach.noRepo")}</p>;
  if (data && docs.length === 0) {
    return <EmptyState icon="FileText" title={t("attach.empty.title")} body={t("attach.empty.body")} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.countPill}>
          {t("attach.attachedCount", { attached: attached.length, total: docs.length })}
        </span>
        <div style={s.filter}>
          <TextInput value={filter} onChange={setFilter} placeholder={t("attach.filterPlaceholder")} />
        </div>
      </div>

      {q && visible.length === 0 ? (
        <p style={s.hint}>{t("attach.noMatches")}</p>
      ) : (
        <div style={s.list}>
          {visible.map((doc) => {
            const isAttached = attachedSet.has(doc.path);
            const { name } = splitDocPath(doc.path);
            return (
              <div key={doc.path}>
                <div
                  style={s.row(isAttached, dragPath === doc.path)}
                  draggable={isAttached}
                  onDragStart={() => isAttached && setDragPath(doc.path)}
                  onDragEnter={() => onDragEnter(doc.path)}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={() => setDragPath(null)}
                  onDrop={() => setDragPath(null)}
                >
                  <span
                    style={s.handle(isAttached)}
                    role={isAttached ? "button" : undefined}
                    tabIndex={isAttached ? 0 : -1}
                    aria-label={isAttached ? `Reorder ${name}` : undefined}
                    onKeyDown={(e) => {
                      if (!isAttached) return;
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        move(doc.path, -1);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        move(doc.path, 1);
                      }
                    }}
                  >
                    <Icon.Menu size={15} />
                  </span>
                  <span
                    role="checkbox"
                    aria-checked={isAttached}
                    aria-label={doc.path}
                    tabIndex={0}
                    style={s.checkbox(isAttached)}
                    onClick={() => toggle(doc.path)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggle(doc.path);
                      }
                    }}
                  >
                    {isAttached && <Icon.Check size={13} />}
                  </span>
                  <span className="mono" style={s.name} title={doc.path}>
                    {name}
                  </span>
                  <Badge icon={DOC_TYPE_ICON[doc.type]} color={DOC_TYPE_COLOR[doc.type]}>
                    {t(`type.${doc.type}`)}
                  </Badge>
                  <span style={s.spacer} />
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="Eye"
                    onClick={() => setPreviewPath(doc.path)}
                  >
                    {t("attach.preview")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewPath &&
        (() => {
          const pd = byPath.get(previewPath);
          const pAttached = attachedSet.has(previewPath);
          return (
            <Drawer
              width={680}
              onClose={() => setPreviewPath(null)}
              title={
                <span style={s.drawerTitle}>
                  <Icon.FileText size={16} aria-hidden />
                  <span className="mono">{previewPath}</span>
                </span>
              }
              subtitle={
                pd && (
                  <span style={s.drawerMeta}>
                    <Badge icon={DOC_TYPE_ICON[pd.type]} color={DOC_TYPE_COLOR[pd.type]}>
                      {t(`type.${pd.type}`)}
                    </Badge>
                    <span>{t("usedByAgents", { count: pd.used_by_agents })}</span>
                    <span>{t("docTokens", { count: pd.tokens })}</span>
                  </span>
                )
              }
            >
              <div style={s.drawerBody}>
                <div>
                  <Button
                    kind={pAttached ? "secondary" : "primary"}
                    size="sm"
                    icon={pAttached ? "Check" : "Plus"}
                    onClick={() => toggle(previewPath)}
                  >
                    {pAttached ? t("attach.attached") : t("attach.attach")}
                  </Button>
                </div>
                <div style={s.drawerCard}>
                  {preview.isLoading ? (
                    <Skeleton height={160} />
                  ) : preview.isError ? (
                    <ErrorState body={t("loadError.body")} onRetry={() => preview.refetch()} />
                  ) : (
                    <Markdown>{preview.data?.body ?? ""}</Markdown>
                  )}
                </div>
              </div>
            </Drawer>
          );
        })()}
    </div>
  );
}
