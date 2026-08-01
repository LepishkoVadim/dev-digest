/* SkillCard — type + source badges, needs-vetting indicator, enabled toggle.
   Reused by the Skills list grid and (compact/active) the editor's left rail. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "../../../../lib/hooks/skills";
import { typeColor, sourceColor } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  compact,
  onClick,
}: {
  skill: Skill;
  active?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const update = useUpdateSkill();
  const needsVetting = !skill.enabled && skill.source !== "manual";

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled, !!compact)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={skill.enabled}
            onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
            size={14}
          />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) del.mutate(skill.id);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={s.del(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      {!compact && <div style={s.description}>{skill.description || t("listItem.noDescription")}</div>}
      <div style={s.metaRow}>
        <span style={s.chip(typeColor(skill.type))}>{t(`listItem.type.${skill.type}`)}</span>
        <span style={s.chip(sourceColor(skill.source))}>{t(`listItem.source.${skill.source}`)}</span>
        {needsVetting && (
          <span style={s.vetting} title={t("listItem.vettingTitle")}>
            <Icon.AlertTriangle size={12} />
            {t("listItem.needsVetting")}
          </span>
        )}
      </div>
    </div>
  );
}
