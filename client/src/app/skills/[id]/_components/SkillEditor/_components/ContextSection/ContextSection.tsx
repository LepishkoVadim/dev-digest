"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { DocAttachList } from "../../../../../../../components/doc-attach";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

/**
 * Skill Context section (Step 10 / AC-21, AC-23). Attach/detach/reorder Project
 * Context docs for this skill (save-on-change), plus:
 *  - the "SERIALIZES AS" preview: a STATIC path list under a
 *    `## Project specifications` heading, labelled as an edit-time attachment
 *    preview — distinct from the run-time `## Project context` block (which holds
 *    resolved bodies).
 *  - the skill's "used by N agents" count.
 */
export function ContextSection({ skill }: { skill: Skill }) {
  const t = useTranslations("context");
  const update = useUpdateSkill();

  const [paths, setPaths] = React.useState<string[]>(skill.doc_paths);
  React.useEffect(() => {
    setPaths(skill.doc_paths); // eslint-disable-line react-hooks/set-state-in-effect
  }, [skill.doc_paths]);

  const onChange = (next: string[]) => {
    setPaths(next);
    update.mutate({ id: skill.id, patch: { doc_paths: next } });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titleWrap}>
          <h2 style={s.h2}>{t("attach.title")}</h2>
          <p style={s.subtitle}>{t("attach.subtitle")}</p>
        </div>
        {skill.used_by_agents != null && (
          <Badge icon="Cpu" color="var(--text-secondary)">
            {t("attach.usedByAgents", { count: skill.used_by_agents })}
          </Badge>
        )}
      </div>

      <DocAttachList attached={paths} onChange={onChange} />

      <div style={s.serializes}>
        <div style={s.serializesLabel}>{t("attach.serializesAs")}</div>
        <p style={s.serializesHint}>{t("attach.serializesHint")}</p>
        <pre className="mono" style={s.serializesPre}>
          {paths.length === 0 ? "## Project specifications\n(none)" : `## Project specifications\n${paths.map((p) => `- ${p}`).join("\n")}`}
        </pre>
      </div>
    </div>
  );
}
