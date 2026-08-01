import type { SkillType } from "@devdigest/shared";

/** Selectable skill types in the create form (matches the SkillType enum). */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Default type for a new manual skill. */
export const DEFAULT_TYPE: SkillType = "custom";

/** Modal width (px). */
export const MODAL_WIDTH = 620;
