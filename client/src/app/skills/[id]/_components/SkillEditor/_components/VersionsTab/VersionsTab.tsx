/* Versions tab — every save snapshots the body. List newest-first; latest row
   is "Current". Older rows offer Diff (client-side line diff vs current body in
   a Modal) and Restore (creates a new version from the old body). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Badge, Skeleton, EmptyState } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import {
  useSkillVersions,
  useRestoreSkillVersion,
  type SkillVersion,
} from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { lineDiff } from "./helpers";

const DIFF_COLOR = {
  add: { color: "var(--ok)", bg: "rgba(34,197,94,0.10)", sign: "+" },
  del: { color: "var(--crit)", bg: "rgba(239,68,68,0.10)", sign: "-" },
  same: { color: "var(--text-secondary)", bg: "transparent", sign: " " },
} as const;

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<SkillVersion | null>(null);

  if (isLoading) return <Skeleton height={200} />;
  const rows = [...(versions ?? [])].sort((a, b) => b.version - a.version);
  if (rows.length === 0)
    return <EmptyState icon="History" title={t("editor.versions.emptyTitle")} body={t("editor.versions.emptyBody")} />;

  const doRestore = (version: number) =>
    restore.mutate(
      { id: skill.id, version },
      { onSuccess: (d) => toast.success(t("editor.versions.restoredToast", { version: d.version })) },
    );

  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>
        {t("editor.versions.intro")}
      </p>
      {rows.map((v) => {
        const current = v.version === skill.version;
        return (
          <div
            key={v.version}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-elevated)",
              marginBottom: 8,
            }}
          >
            <Badge color="var(--text-muted)" mono>
              {t("preview.version", { version: v.version })}
            </Badge>
            <span style={{ fontSize: 13, color: "var(--text-muted)", flex: 1 }}>
              {new Date(v.created_at).toLocaleString()}
            </span>
            {current ? (
              <Badge color="var(--accent)" icon="Check">
                {t("editor.versions.current")}
              </Badge>
            ) : (
              <>
                <Button kind="ghost" size="sm" icon="GitCommit" onClick={() => setDiffOf(v)}>
                  {t("editor.versions.diff")}
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="History"
                  onClick={() => doRestore(v.version)}
                  disabled={restore.isPending}
                >
                  {t("editor.versions.restore")}
                </Button>
              </>
            )}
          </div>
        );
      })}

      {diffOf && (
        <Modal
          width={760}
          title={t("editor.versions.diffTitle", { version: diffOf.version })}
          subtitle={t("editor.versions.diffSubtitle")}
          onClose={() => setDiffOf(null)}
        >
          <pre
            className="mono"
            style={{ margin: 0, padding: 16, fontSize: 12.5, lineHeight: 1.5, overflow: "auto" }}
          >
            {lineDiff(diffOf.body, skill.body).map((l, i) => {
              const c = DIFF_COLOR[l.kind];
              return (
                <div key={i} style={{ color: c.color, background: c.bg, whiteSpace: "pre-wrap" }}>
                  {c.sign} {l.text}
                </div>
              );
            })}
          </pre>
        </Modal>
      )}
    </div>
  );
}
