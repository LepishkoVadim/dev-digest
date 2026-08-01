import { describe, it, expect } from 'vitest';
import { redactToken, withGitHubToken } from './helpers.js';

describe('redactToken', () => {
  it('replaces every occurrence of the PAT with ***', () => {
    const token = 'ghp_secret123';
    const url = withGitHubToken('https://github.com/o/r.git', token);
    // Simulates a git error echoing the tokenized remote URL.
    const msg = `fatal: unable to access '${url}': The requested URL returned error: 403`;

    const redacted = redactToken(msg, token);

    expect(redacted).not.toContain(token);
    expect(redacted).toContain('***');
  });

  it('is a no-op when there is no token', () => {
    const msg = 'fatal: repository not found';
    expect(redactToken(msg, null)).toBe(msg);
    expect(redactToken(msg, undefined)).toBe(msg);
  });
});
