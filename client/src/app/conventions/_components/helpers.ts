import type { ConventionCandidate, Repo } from "@devdigest/shared";

/** Deep-link a candidate's evidence to GitHub (`blob/<branch>/<path>#L<line>`). */
export function githubEvidenceUrl(repo: Repo, c: ConventionCandidate): string {
  const base = `https://github.com/${repo.full_name}/blob/${repo.default_branch}/${c.evidence_path}`;
  return c.evidence_line ? `${base}#L${c.evidence_line}` : base;
}

/** `<repo>` from `owner/<repo>` — the default skill name stem. */
export function repoStem(repo: Repo): string {
  return repo.full_name.split("/").pop() ?? repo.full_name;
}

export function defaultSkillName(repo: Repo): string {
  return `${repoStem(repo)}-conventions`;
}

/**
 * Render the accepted candidates into the skill body shown (and editable) in the
 * modal. Mirrors the server's builder so the modal is WYSIWYG; the server still
 * rebuilds when `body` is omitted.
 */
export function buildSkillBody(repo: Repo, accepted: ConventionCandidate[]): string {
  const stem = repoStem(repo);
  const header = `# ${stem}-conventions

House conventions for \`${stem}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const sections = accepted.map((c) => {
    const loc = c.evidence_line ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path;
    return `## ${c.rule}

Detected in \`${loc}\`:

\`\`\`
${c.evidence_snippet}
\`\`\``;
  });
  return [header, ...sections].join("\n\n");
}
