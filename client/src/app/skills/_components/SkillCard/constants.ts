import type { SkillType, SkillSource } from "@devdigest/shared";

/** Skill type → chip colour. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#f43f5e",
  custom: "#8b5cf6",
};

/** Skill source → chip colour. */
export const SOURCE_COLOR: Record<SkillSource, string> = {
  manual: "var(--text-secondary)",
  extracted: "#8b5cf6",
  community: "#f59e0b",
  imported_url: "#3b82f6",
};
