import { describe, expect, it } from 'vitest';
import { normalizeIdentifierValue, validateIdentifierInput } from './validation';

describe('validation', () => {
  it('normalizes email and validates correctly', () => {
    const result = validateIdentifierInput('email', ' User@Example.com ');

    expect(result.ok).toBe(true);
    expect(result.normalizedValue).toBe('user@example.com');
  });

  it('rejects invalid phone numbers', () => {
    const result = validateIdentifierInput('phone', 'abc');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Enter a valid phone number.');
  });

  it('normalizes phone whitespace', () => {
    expect(normalizeIdentifierValue('phone', '+1 555 111 2222')).toBe('+15551112222');
  });
});
