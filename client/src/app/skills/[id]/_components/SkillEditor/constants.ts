import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs, mirroring the agent editor shape. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "context", labelKey: "editor.tabs.context", icon: "Folder" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" },
];
