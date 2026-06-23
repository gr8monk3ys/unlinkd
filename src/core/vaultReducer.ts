import type { Account, ConnectorInstance, ConnectorState, Identifier, Persona, RiskFinding } from './types';
import type { VaultSettings, VaultStateV1 } from './vault';
import { setFindingStatus } from './findings';

/**
 * Pure vault state transitions.
 *
 * These functions take the current vault and return the next vault with no side
 * effects (no persistence, no audit, no React). The hook owns orchestration
 * (validation, setVault, persist, audit); this module owns the state shape, so
 * every transition is unit-testable without mounting React or touching storage.
 */

export function addPersona(vault: VaultStateV1, persona: Persona): VaultStateV1 {
  return { ...vault, personas: [...vault.personas, persona], activePersonaId: persona.id };
}

export function setActivePersona(vault: VaultStateV1, personaId: string): VaultStateV1 {
  return { ...vault, activePersonaId: personaId };
}

export function addIdentifier(vault: VaultStateV1, identifier: Identifier): VaultStateV1 {
  return { ...vault, identifiers: [...vault.identifiers, identifier] };
}

export function addAccount(vault: VaultStateV1, account: Account): VaultStateV1 {
  return { ...vault, accounts: [...vault.accounts, account] };
}

export function addConnectorInstance(vault: VaultStateV1, instance: ConnectorInstance): VaultStateV1 {
  return { ...vault, connectorInstances: [...vault.connectorInstances, instance] };
}

/** Replace a single connector instance (matched by id) in place. */
export function replaceConnectorInstance(vault: VaultStateV1, updated: ConnectorInstance): VaultStateV1 {
  return {
    ...vault,
    connectorInstances: vault.connectorInstances.map((item) => (item.id === updated.id ? updated : item))
  };
}

export interface ConnectorTransitionPatch {
  to: ConnectorState;
  nextCheckAt: string | undefined;
  updatedAt: string;
}

/** Apply a state transition to a connector instance (matched by id). No-op if absent. */
export function applyConnectorTransition(
  vault: VaultStateV1,
  instanceId: string,
  patch: ConnectorTransitionPatch
): VaultStateV1 {
  return {
    ...vault,
    connectorInstances: vault.connectorInstances.map((item) =>
      item.id === instanceId
        ? { ...item, state: patch.to, nextCheckAt: patch.nextCheckAt, updatedAt: patch.updatedAt }
        : item
    )
  };
}

/**
 * Merge a fresh scan's findings into the vault, preserving any user-set status
 * on findings that re-appear (so a rescan doesn't reset "mitigated" back to
 * "open"). New findings keep their fresh fields and default status.
 */
export function mergeScanFindings(vault: VaultStateV1, scanned: RiskFinding[]): VaultStateV1 {
  const merged = new Map<string, RiskFinding>();
  [...vault.findings, ...scanned].forEach((finding) => {
    const existing = merged.get(finding.id);
    merged.set(finding.id, existing ? { ...finding, status: existing.status ?? finding.status } : finding);
  });
  return { ...vault, findings: [...merged.values()] };
}

export function setFindingStatusInVault(
  vault: VaultStateV1,
  id: string,
  status: NonNullable<RiskFinding['status']>
): VaultStateV1 {
  return { ...vault, findings: setFindingStatus(vault.findings, id, status) };
}

export function setHibpApiKey(vault: VaultStateV1, key: string): VaultStateV1 {
  const trimmed = key.trim();
  const settings: VaultSettings = { ...vault.settings, hibpApiKey: trimmed.length > 0 ? trimmed : undefined };
  return { ...vault, settings };
}
