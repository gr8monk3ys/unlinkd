import { describe, expect, it } from 'vitest';
import { canAddIdentifier, findCrossPersonaDuplicate, hasDuplicateIdentifier } from './policy';
import type { Identifier } from './types';

function makeId(overrides: Partial<Identifier> & Pick<Identifier, 'id' | 'type' | 'value'>): Identifier {
  return { sensitivity: 2, consent: true, ...overrides };
}

describe('policy', () => {
  describe('hasDuplicateIdentifier', () => {
    it('detects duplicate identifiers by type and value', () => {
      const duplicate = hasDuplicateIdentifier(
        [makeId({ id: '1', type: 'email', value: 'a@a.com' })],
        'email',
        'a@a.com'
      );

      expect(duplicate).toBe(true);
    });

    it('returns false when no duplicate exists', () => {
      const duplicate = hasDuplicateIdentifier(
        [makeId({ id: '1', type: 'email', value: 'a@a.com' })],
        'email',
        'b@b.com'
      );

      expect(duplicate).toBe(false);
    });

    it('returns false for same value but different type', () => {
      const duplicate = hasDuplicateIdentifier(
        [makeId({ id: '1', type: 'email', value: 'test' })],
        'username',
        'test'
      );

      expect(duplicate).toBe(false);
    });

    it('returns false for empty list', () => {
      expect(hasDuplicateIdentifier([], 'email', 'a@a.com')).toBe(false);
    });
  });

  describe('canAddIdentifier', () => {
    it('prevents additions once identifier max is reached', () => {
      const allowed = canAddIdentifier(
        [makeId({ id: '1', type: 'email', value: 'a@a.com' })],
        1
      );

      expect(allowed).toBe(false);
    });

    it('allows additions under the max', () => {
      const allowed = canAddIdentifier(
        [makeId({ id: '1', type: 'email', value: 'a@a.com' })],
        10
      );

      expect(allowed).toBe(true);
    });

    it('allows additions to empty list', () => {
      expect(canAddIdentifier([], 5)).toBe(true);
    });
  });

  describe('findCrossPersonaDuplicate', () => {
    it('finds cross-persona duplicate', () => {
      const identifiers = [
        makeId({ id: '1', type: 'email', value: 'shared@test.com', personaId: 'persona-a' }),
        makeId({ id: '2', type: 'email', value: 'unique@test.com', personaId: 'persona-b' })
      ];

      const result = findCrossPersonaDuplicate(identifiers, 'persona-b', 'email', 'shared@test.com');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('1');
    });

    it('returns null when no cross-persona duplicate', () => {
      const identifiers = [
        makeId({ id: '1', type: 'email', value: 'shared@test.com', personaId: 'persona-a' })
      ];

      const result = findCrossPersonaDuplicate(identifiers, 'persona-a', 'email', 'shared@test.com');
      expect(result).toBeNull();
    });

    it('returns null for empty list', () => {
      const result = findCrossPersonaDuplicate([], 'persona-a', 'email', 'test@test.com');
      expect(result).toBeNull();
    });

    it('returns null when value differs', () => {
      const identifiers = [
        makeId({ id: '1', type: 'email', value: 'other@test.com', personaId: 'persona-a' })
      ];

      const result = findCrossPersonaDuplicate(identifiers, 'persona-b', 'email', 'shared@test.com');
      expect(result).toBeNull();
    });
  });
});
