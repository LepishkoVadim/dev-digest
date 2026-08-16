import { z } from 'zod';

/**
 * Project Context docs. The reader/editors browse `.md` files found in the
 * selected repo's clone under configured roots. v1 = read + attach only; no
 * authoring, chunking, or embedding.
 */

/** Doc-type badge derived from a doc's root (`readme` = top-level README.md). */
export const DocType = z.enum(['specs', 'docs', 'insights', 'readme']);
export type DocType = z.infer<typeof DocType>;

export const DocListItem = z.object({
  /** Bare repo-relative path, e.g. `specs/public-api.md`. */
  path: z.string(),
  /** Server-side tokenizer count of the doc body. */
  tokens: z.number().int(),
  type: DocType,
  /** Agents whose resolved doc set (own ∪ skill-inherited, deduped) has this path. */
  used_by_agents: z.number().int(),
});
export type DocListItem = z.infer<typeof DocListItem>;

export const DocList = z.object({
  docs: z.array(DocListItem),
  /** ISO timestamp of the walk. */
  scanned_at: z.string(),
});
export type DocList = z.infer<typeof DocList>;
