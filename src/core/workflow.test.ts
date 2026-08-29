import { describe, expect, it } from 'vitest';
import { canTransition, nextStates } from './workflow';

describe('workflow', () => {
  describe('nextStates', () => {
    it('lists next valid states from verified', () => {
      expect(nextStates('verified')).toEqual(['user_approved']);
    });

    it('lists next valid states from discovered', () => {
      expect(nextStates('discovered')).toEqual(['verified']);
    });

    it('lists next valid states from user_approved', () => {
      expect(nextStates('user_approved')).toEqual(['executed']);
    });

    it('lists next valid states from executed', () => {
      expect(nextStates('executed')).toEqual(['proof_captured']);
    });

    it('lists next valid states from proof_captured', () => {
      expect(nextStates('proof_captured')).toEqual(['recheck_scheduled']);
    });

    it('allows restarting or rescheduling from recheck_scheduled (not a dead end)', () => {
      expect(nextStates('recheck_scheduled')).toEqual(['discovered', 'recheck_scheduled']);
    });
  });

  describe('canTransition', () => {
    it('prevents invalid transitions', () => {
      expect(canTransition('discovered', 'executed')).toBe(false);
    });

    it('allows valid forward transition', () => {
      expect(canTransition('discovered', 'verified')).toBe(true);
    });

    it('prevents backward transitions', () => {
      expect(canTransition('verified', 'discovered')).toBe(false);
    });

    it('prevents skipping states', () => {
      expect(canTransition('discovered', 'user_approved')).toBe(false);
    });

    it('allows full workflow path', () => {
      expect(canTransition('discovered', 'verified')).toBe(true);
      expect(canTransition('verified', 'user_approved')).toBe(true);
      expect(canTransition('user_approved', 'executed')).toBe(true);
      expect(canTransition('executed', 'proof_captured')).toBe(true);
      expect(canTransition('proof_captured', 'recheck_scheduled')).toBe(true);
    });

    it('prevents self-transitions', () => {
      expect(canTransition('discovered', 'discovered')).toBe(false);
      expect(canTransition('verified', 'verified')).toBe(false);
    });
  });
});
