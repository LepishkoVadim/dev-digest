/* Evals tab — stub. No runner, no data. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function EvalsTab() {
  const t = useTranslations("skills");
  return <EmptyState icon="FlaskConical" title={t("editor.evals.title")} body={t("editor.evals.body")} />;
}
