"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { DocAttachList } from "../../../../../../../components/doc-attach";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import { useRepoDocs } from "../../../../../../../lib/hooks/docs";
import { useUpdateAgent } from "../../../../../../../lib/hooks/agents";
import { s } from "./styles";

/**
 * Agent Context tab — attach/detach/reorder Project Context docs for this agent.
 * Save-on-change (PUT doc_paths). Shows the attached-token total (derived during
 * render from the doc list, never stored) + the fixed injection caption.
 */
export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("context");
  const { repoId } = useActiveRepo();
  const { data } = useRepoDocs(repoId);
  const update = useUpdateAgent();

  // Optimistic local order so reorder/attach feels instant; server is authoritative.
  const [paths, setPaths] = React.useState<string[]>(agent.doc_paths);
  React.useEffect(() => {
    setPaths(agent.doc_paths); // eslint-disable-line react-hooks/set-state-in-effect
  }, [agent.doc_paths]);

  const onChange = (next: string[]) => {
    setPaths(next);
    update.mutate({ id: agent.id, patch: { doc_paths: next } });
  };

  // Attached-token total: sum per-doc tokens of currently-attached docs (AC-8).
  const tokensByPath = new Map((data?.docs ?? []).map((d) => [d.path, d.tokens]));
  const tokenTotal = paths.reduce((sum, p) => sum + (tokensByPath.get(p) ?? 0), 0);

  return (
    <div style={s.wrap}>
      <div style={s.tokenBar}>
        <span style={s.tokenTotal}>{t("attach.tokenTotal", { count: tokenTotal })}</span>
        <span style={s.caption}>{t("attach.injectionCaption")}</span>
      </div>
      <DocAttachList attached={paths} onChange={onChange} />
    </div>
  );
}
