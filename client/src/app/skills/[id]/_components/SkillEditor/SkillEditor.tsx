/* SkillEditor — header (name + type + version badges, disabled Run-on-evals)
   + tab bar routing to the config/preview/versions/stats/evals tabs.
   Mirrors AgentEditor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs, Badge, Button, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { StatsTab } from "./_components/StatsTab";
import { EvalsTab } from "./_components/EvalsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 className="mono" style={s.name}>
          {skill.name}
        </h1>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
        {!skill.enabled && <Badge color="var(--text-muted)">{t("preview.disabled")}</Badge>}
        <div style={{ marginLeft: "auto" }}>
          <Button kind="secondary" size="sm" icon="FlaskConical" disabled>
            {t("editor.runOnEvals")}
          </Button>
        </div>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "evals" && <EvalsTab />}
      </div>
    </div>
  );
}
