import { describe, expect, it } from 'vitest';
import { canTransition, nextStates } from './workflow';

describe('workflow', () => {
  it('lists next valid states', () => {
    expect(nextStates('verified')).toEqual(['user_approved']);
  });

  it('prevents invalid transitions', () => {
    expect(canTransition('discovered', 'executed')).toBe(false);
  });
});
