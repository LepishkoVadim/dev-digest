/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default type when an imported skill doesn't declare one. */
export const DEFAULT_SKILL_TYPE = 'custom' as const;

/** Fallback name when a body has no leading markdown heading to derive from. */
export const DEFAULT_SKILL_NAME = 'imported-skill';
