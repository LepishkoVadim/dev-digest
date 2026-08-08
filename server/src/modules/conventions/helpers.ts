import { z } from 'zod';
import type {
  ConventionCandidate,
  ChatMessage,
  GitClient,
  RepoRef,
} from '@devdigest/shared';
import type { ConventionRow } from './repository.js';

/**
 * Conventions extractor — pure helpers (no I/O, no LLM). The service wires these
 * to git + repo-intel + the LLM; everything model-independent lives here so it's
 * unit-testable in isolation.
 */

/** Config files whose presence encodes house style — always sampled if they exist. */
export const CONFIG_PATHS = [
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.eslintrc.js',
  'eslint.config.js',
  'eslint.config.mjs',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  '.editorconfig',
] as const;

/** How many top-ranked source files to sample beyond the configs. */
export const SAMPLE_FILE_COUNT = 12;
/** Cap per-file content fed to the model (chars) — bounds prompt tokens. */
export const MAX_SAMPLE_CHARS = 4000;

/** What the model returns. Line is a hint; the code-side gate recomputes the real one. */
export const ExtractionResult = z.object({
  candidates: z.array(
    z.object({
      rule: z.string().min(1),
      evidence_path: z.string().min(1),
      evidence_snippet: z.string().min(1),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

export interface Sample {
  path: string;
  content: string;
}

/** Read a repo file, returning null instead of throwing when it doesn't exist. */
export async function readFileSafe(
  git: GitClient,
  ref: RepoRef,
  path: string,
): Promise<string | null> {
  try {
    return await git.readFile(ref, path);
  } catch {
    return null;
  }
}

/** Trim a file's content to the model budget, keeping whole leading lines. */
export function capContent(content: string): string {
  if (content.length <= MAX_SAMPLE_CHARS) return content;
  return content.slice(0, MAX_SAMPLE_CHARS) + '\n… (truncated)';
}

const SYSTEM = `You extract HOUSE CONVENTIONS from a repository — rules the team clearly follows on purpose, not generic style advice.

Rules:
- Only report a convention you can point at with a concrete line of code from the samples.
- \`evidence_snippet\` MUST be copied verbatim from a sample (one representative line is enough).
- \`evidence_path\` MUST be one of the sample file paths given below.
- Prefer project-specific rules (error handling shape, module boundaries, singletons, response types) over trivia.
- confidence in [0,1]: how consistently the samples support the rule.
- Return at most 8 candidates. If nothing is well-supported, return fewer.`;

/** Build the chat messages for extraction from the sampled files. */
export function buildExtractionMessages(samples: Sample[]): ChatMessage[] {
  const body = samples
    .map((s) => `### ${s.path}\n\`\`\`\n${capContent(s.content)}\n\`\`\``)
    .join('\n\n');
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Sampled files from the repository:\n\n${body}\n\nExtract the house conventions.`,
    },
  ];
}

/**
 * Code-side evidence gate. Confirms the snippet actually appears in the file and
 * returns the 1-based line where it starts. Null → the claim is unverifiable and
 * the candidate is dropped. Matching is whitespace-tolerant (exact-trim first,
 * then substring) so cosmetic reformatting by the model doesn't sink real hits.
 */
export function verifySnippet(fileContent: string, snippet: string): number | null {
  const needle = snippet
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!needle) return null;
  const lines = fileContent.split('\n');
  let fallback: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed === needle) return i + 1;
    if (fallback === null && trimmed.length > 0 && trimmed.includes(needle)) fallback = i + 1;
  }
  return fallback;
}

/** Map a DB row to the shared ConventionCandidate DTO. */
export function toCandidateDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
  };
}

/** Slug for the default skill name, e.g. `payments-api` → `payments-api-conventions`. */
export function conventionsSkillName(repoName: string): string {
  return `${repoName}-conventions`;
}

/**
 * Merge accepted candidates into one skill body (markdown). Mirrors the modal
 * mock: a header + one section per rule, each citing its `path:line`.
 */
export function buildSkillBody(repoName: string, accepted: ConventionCandidate[]): string {
  const header = `# ${conventionsSkillName(repoName)}

House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const sections = accepted.map((c) => {
    const loc = c.evidence_line ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path;
    return `## ${c.rule}

Detected in \`${loc}\`:

\`\`\`
${c.evidence_snippet}
\`\`\``;
  });
  return [header, ...sections].join('\n\n');
}
