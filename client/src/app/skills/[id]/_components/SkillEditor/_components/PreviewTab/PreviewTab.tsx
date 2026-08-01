/* Preview tab — renders skill.body as the reviewing agent receives it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("editor.preview.title")}</h2>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 20px" }}>
        {t("editor.preview.subtitle")}
      </p>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 9,
          padding: 20,
          background: "var(--bg-elevated)",
        }}
      >
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
