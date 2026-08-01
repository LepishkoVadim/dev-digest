import type { SkillType, SkillSource } from "@devdigest/shared";
import { TYPE_COLOR, SOURCE_COLOR } from "./constants";

export function typeColor(type: SkillType): string {
  return TYPE_COLOR[type] ?? "var(--text-secondary)";
}

export function sourceColor(source: SkillSource): string {
  return SOURCE_COLOR[source] ?? "var(--text-secondary)";
}
