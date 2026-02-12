import { describe, expect, it } from 'vitest';
import { canAddIdentifier, hasDuplicateIdentifier } from './policy';

describe('policy', () => {
  it('detects duplicate identifiers by type and value', () => {
    const duplicate = hasDuplicateIdentifier(
      [{ id: '1', type: 'email', value: 'a@a.com', sensitivity: 2, consent: true }],
      'email',
      'a@a.com'
    );

    expect(duplicate).toBe(true);
  });

  it('prevents additions once identifier max is reached', () => {
    const allowed = canAddIdentifier([{ id: '1', type: 'email', value: 'a@a.com', sensitivity: 2, consent: true }], 1);

    expect(allowed).toBe(false);
  });
});
