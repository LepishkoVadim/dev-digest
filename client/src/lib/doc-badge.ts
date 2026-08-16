/* doc-badge.ts — shared doc-type → icon/color mapping for Project Context
   surfaces (the reader page + the agent/skill editor doc lists). */
import type { IconName } from "@devdigest/ui";
import type { DocType } from "@devdigest/shared";

export const DOC_TYPE_ICON: Record<DocType, IconName> = {
  specs: "FileText",
  docs: "Folder",
  insights: "Lightbulb",
  readme: "Info",
};

export const DOC_TYPE_COLOR: Record<DocType, string> = {
  specs: "var(--accent-text)",
  docs: "var(--text-secondary)",
  insights: "var(--warn)",
  readme: "var(--text-muted)",
};

/** Filename (last path segment) and its directory prefix, for list rows. */
export function splitDocPath(path: string): { name: string; prefix: string } {
  const i = path.lastIndexOf("/");
  return i === -1
    ? { name: path, prefix: "" }
    : { name: path.slice(i + 1), prefix: path.slice(0, i + 1) };
}
