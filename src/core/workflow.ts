import type { ConnectorState } from './types';

const allowedTransitions: Record<ConnectorState, ConnectorState[]> = {
  discovered: ['verified'],
  verified: ['user_approved'],
  user_approved: ['executed'],
  executed: ['proof_captured'],
  proof_captured: ['recheck_scheduled'],
  // A due recheck is actionable, not terminal: either the exposure came back
  // and the workflow restarts from `discovered`, or the recheck passed and a
  // new recheck window is scheduled (self-transition with a fresh date).
  recheck_scheduled: ['discovered', 'recheck_scheduled']
};

export function nextStates(current: ConnectorState): ConnectorState[] {
  return allowedTransitions[current];
}

export function canTransition(from: ConnectorState, to: ConnectorState): boolean {
  return allowedTransitions[from].includes(to);
}
