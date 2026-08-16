import type { DocType } from '@devdigest/shared';

/**
 * Pure helpers for the docs module — no I/O. Path classification + the `.md`
 * glob predicate under configured roots.
 */

/**
 * True when `relPath` is a Project Context doc: a `.md` file under one of the
 * configured `roots` (any depth) OR the top-level `README.md`.
 */
export function isDocPath(relPath: string, roots: string[]): boolean {
  if (!relPath.toLowerCase().endsWith('.md')) return false;
  if (relPath.toLowerCase() === 'readme.md') return true;
  const top = relPath.split('/')[0];
  return top !== undefined && roots.includes(top);
}

/**
 * Doc-type badge from a doc's location: its top-level root dir name when that is
 * a known type, else `readme` for the top-level README.md, else `docs` as a safe
 * default (a doc under a configured-but-unknown root).
 */
export function docTypeFor(relPath: string): DocType {
  if (relPath.toLowerCase() === 'readme.md') return 'readme';
  const top = relPath.split('/')[0];
  if (top === 'specs' || top === 'insights' || top === 'docs') return top;
  return 'docs';
}
