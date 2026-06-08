export type PassphraseStrengthLabel = 'too short' | 'weak' | 'fair' | 'good' | 'strong';

export interface PassphraseStrength {
  /** 0 (unusable) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: PassphraseStrengthLabel;
  /** Whether the passphrase clears the minimum bar for creating a vault. */
  acceptable: boolean;
  suggestions: string[];
}

export const MIN_PASSPHRASE_LENGTH = 8;

/**
 * Lightweight, dependency-free passphrase strength heuristic.
 *
 * This is intentionally simple — it nudges users away from trivially weak
 * passphrases. It is not a substitute for a real estimator like zxcvbn, and
 * we say as much in the UI.
 */
export function estimatePassphraseStrength(passphrase: string): PassphraseStrength {
  const suggestions: string[] = [];

  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return {
      score: 0,
      label: 'too short',
      acceptable: false,
      suggestions: [`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`]
    };
  }

  let score = 0;

  // Length tiers.
  if (passphrase.length >= 12) score += 1;
  if (passphrase.length >= 16) score += 1;

  // Character-class variety.
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(passphrase)).length;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;

  // Penalize obvious low-entropy shapes.
  const lower = passphrase.toLowerCase();
  const hasRepeats = /(.)\1{2,}/.test(passphrase);
  const isSingleClass = classes <= 1;
  const commonWeak = ['password', 'passphrase', 'qwerty', '12345678', 'letmein', 'iloveyou'];
  const looksCommon = commonWeak.some((weak) => lower.includes(weak));

  if (hasRepeats) {
    score -= 1;
    suggestions.push('Avoid repeating the same character.');
  }
  if (looksCommon) {
    score = Math.min(score, 1);
    suggestions.push('Avoid common words and sequences.');
  }
  if (isSingleClass) {
    suggestions.push('Mix letters, numbers, and symbols.');
  }
  if (passphrase.length < 16) {
    suggestions.push('Longer passphrases are stronger — aim for 16+ characters.');
  }

  const clamped = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;

  const labels: Record<0 | 1 | 2 | 3 | 4, PassphraseStrengthLabel> = {
    0: 'weak',
    1: 'weak',
    2: 'fair',
    3: 'good',
    4: 'strong'
  };

  return {
    score: clamped,
    label: labels[clamped],
    // We accept "fair" and above so we don't block legitimate strong passphrases
    // that happen to score conservatively, but we still reject the weakest ones.
    acceptable: clamped >= 2,
    suggestions
  };
}
