import type { IconName } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

/** Icon per skill type for the row badge (labels are the raw type text). */
export const SKILL_TYPE_ICON: Record<SkillType, IconName> = {
  rubric: "ListChecks",
  convention: "FileText",
  security: "Shield",
  custom: "Sparkles",
};

/** Skill type → badge colour. Mirrors the /skills SkillCard palette. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#f43f5e",
  custom: "#8b5cf6",
};
