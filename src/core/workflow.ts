import type { ConnectorState } from './types';

const allowedTransitions: Record<ConnectorState, ConnectorState[]> = {
  discovered: ['verified'],
  verified: ['user_approved'],
  user_approved: ['executed'],
  executed: ['proof_captured'],
  proof_captured: ['recheck_scheduled'],
  recheck_scheduled: []
};

export function nextStates(current: ConnectorState): ConnectorState[] {
  return allowedTransitions[current];
}

export function canTransition(from: ConnectorState, to: ConnectorState): boolean {
  return allowedTransitions[from].includes(to);
}
