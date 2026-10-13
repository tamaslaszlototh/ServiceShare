import { describe, it, expect } from 'vitest';
import { generatePkce, pkceChallengeFromVerifier } from './auth';

describe('PKCE', () => {
  it('generates verifier of appropriate length and challenge with S256', async () => {
    const pkce = generatePkce();
    expect(pkce.verifier.length).toBeGreaterThan(43);
    expect(pkce.verifier.length).toBeLessThanOrEqual(128);
    expect(pkce.codeChallengeMethod).toBe('S256');
    const expected = await pkceChallengeFromVerifier(pkce.verifier);
    expect(pkce.codeChallenge).toBe(expected);
  });

  it('generates different values each time', () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});
