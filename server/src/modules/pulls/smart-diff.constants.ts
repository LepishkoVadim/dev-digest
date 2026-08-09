/**
 * Smart Diff classification patterns and thresholds. Tuned here, not inline, so
 * the risk-ordering rules are one file to review and adjust. Paths are matched
 * as posix (forward-slash) strings against the whole PR-relative path.
 */

/** Generated / mechanical files — skimmed last. Lock files ALWAYS land here. */
export const BOILERPLATE_PATTERNS: RegExp[] = [
  // dependency lock files (across ecosystems)
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|npm-shrinkwrap\.json|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock|go\.sum)$/,
  // dependency manifest — reviewed as a bump, not as logic
  /(^|\/)package\.json$/,
  // build / generated output & vendored trees
  /(^|\/)(dist|build|out|coverage|\.next|node_modules|vendor)\//,
  // test snapshots
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  // minified / source maps
  /\.min\.(js|css)$/,
  /\.map$/,
];

/** Config and entry/glue files — the app's wiring, reviewed after core logic. */
export const WIRING_PATTERNS: RegExp[] = [
  // barrel / entrypoint / glue by basename
  /(^|\/)(index|server|main|app|config|bootstrap)\.[cm]?[jt]sx?$/,
  // *.config.{js,ts,mjs,cjs}
  /\.config\.[cm]?[jt]s$/,
  // TS / build config
  /(^|\/)tsconfig[^/]*\.json$/,
  // env, container, CI
  /(^|\/)\.env/,
  /(^|\/)Dockerfile$/,
  /(^|\/)docker-compose[^/]*\.ya?ml$/,
  /(^|\/)\.github\//,
  // lint / format config
  /(^|\/)\.(eslintrc|prettierrc)/,
  // remaining yaml/yml is configuration
  /\.ya?ml$/,
];

/**
 * A PR whose changed lines exceed this AND spans more than one directory earns a
 * "consider splitting" suggestion. Boilerplate lines are excluded from the split
 * grouping but still counted toward the total.
 */
export const TOO_BIG_TOTAL_LINES = 500;
