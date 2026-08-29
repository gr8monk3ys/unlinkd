import { describe, expect, it } from 'vitest';
import { estimatePassphraseStrength, MIN_PASSPHRASE_LENGTH } from './passphrase';

describe('estimatePassphraseStrength', () => {
  it('rejects passphrases below the minimum length', () => {
    const result = estimatePassphraseStrength('short');
    expect(result.acceptable).toBe(false);
    expect(result.score).toBe(0);
    expect(result.label).toBe('too short');
    expect(result.suggestions[0]).toContain(String(MIN_PASSPHRASE_LENGTH));
  });

  it('marks a long, varied passphrase as strong and acceptable', () => {
    const result = estimatePassphraseStrength('Tr0ub4dour&3-correct-horse');
    expect(result.score).toBe(4);
    expect(result.label).toBe('strong');
    expect(result.acceptable).toBe(true);
  });

  it('penalizes common weak passwords', () => {
    const result = estimatePassphraseStrength('password123');
    expect(result.acceptable).toBe(false);
    expect(result.suggestions.join(' ')).toContain('common');
  });

  it('penalizes long runs of repeated characters', () => {
    const repeated = estimatePassphraseStrength('aaaaaaaaaaaa');
    expect(repeated.acceptable).toBe(false);
  });

  it('accepts a moderately strong passphrase', () => {
    const result = estimatePassphraseStrength('blue-river-92');
    expect(result.acceptable).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(2);
  });
});
